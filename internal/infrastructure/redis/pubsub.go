package redisx

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"PMAS/internal/logging"
	"PMAS/internal/realtime"
)

// Client wraps go-redis for chat realtime use.
type Client struct {
	rdb *redis.Client
}

// NewClient connects to Redis. Returns nil client error if url empty.
func NewClient(redisURL string) (*Client, error) {
	redisURL = strings.TrimSpace(redisURL)
	if redisURL == "" {
		return nil, fmt.Errorf("redis url required")
	}
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, err
	}
	return &Client{rdb: rdb}, nil
}

func (c *Client) Close() error {
	if c == nil || c.rdb == nil {
		return nil
	}
	return c.rdb.Close()
}

func (c *Client) RDB() *redis.Client { return c.rdb }

// CompanyChannel returns the bounded Redis pub/sub channel for a company.
func CompanyChannel(companyID uuid.UUID) string {
	return "pmass:chat:company:" + companyID.String()
}

// Publisher publishes realtime events to Redis.
type Publisher struct {
	client  *Client
	metrics *realtime.Metrics
}

func NewPublisher(client *Client, metrics *realtime.Metrics) *Publisher {
	return &Publisher{client: client, metrics: metrics}
}

func (p *Publisher) Publish(ctx context.Context, event realtime.Event) error {
	if p == nil || p.client == nil || p.client.rdb == nil {
		return fmt.Errorf("redis publisher unavailable")
	}
	payload, err := realtime.EncodeEvent(event)
	if err != nil {
		return err
	}
	channel := CompanyChannel(event.CompanyID)
	if err := p.client.rdb.Publish(ctx, channel, payload).Err(); err != nil {
		if p.metrics != nil {
			p.metrics.RedisPublishFailures.Add(1)
		}
		logging.Error("chat_redis_publish_failed", "error", err.Error(), "channel", channel)
		return err
	}
	return nil
}

// Subscriber receives company-channel events and delivers them to the hub.
type Subscriber struct {
	client  *Client
	hub     *realtime.Hub
	metrics *realtime.Metrics

	cancel context.CancelFunc
	done   chan struct{}
}

func NewSubscriber(client *Client, hub *realtime.Hub, metrics *realtime.Metrics) *Subscriber {
	return &Subscriber{client: client, hub: hub, metrics: metrics, done: make(chan struct{})}
}

// Start begins a pattern subscription for all company chat channels.
// Uses a single PubSub connection per API process.
func (s *Subscriber) Start(parent context.Context) {
	ctx, cancel := context.WithCancel(parent)
	s.cancel = cancel
	go s.loop(ctx)
}

func (s *Subscriber) loop(ctx context.Context) {
	defer close(s.done)
	pattern := "pmass:chat:company:*"
	for {
		if ctx.Err() != nil {
			return
		}
		if err := s.runOnce(ctx, pattern); err != nil {
			if ctx.Err() != nil {
				return
			}
			if s.metrics != nil {
				s.metrics.RedisReconnects.Add(1)
			}
			logging.Warn("chat_redis_subscriber_reconnect", "error", err.Error())
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
		}
	}
}

func (s *Subscriber) runOnce(ctx context.Context, pattern string) error {
	pubsub := s.client.rdb.PSubscribe(ctx, pattern)
	defer func() { _ = pubsub.Close() }()

	if _, err := pubsub.Receive(ctx); err != nil {
		return err
	}
	logging.Info("chat_redis_subscriber_ready", "pattern", pattern)

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return fmt.Errorf("pubsub channel closed")
			}
			if msg == nil {
				continue
			}
			event, err := realtime.DecodeEvent([]byte(msg.Payload))
			if err != nil {
				logging.Warn("chat_redis_invalid_event", "error", err.Error())
				continue
			}
			s.hub.DeliverEvent(event)
		}
	}
}

// Stop cancels the subscriber and waits briefly for exit.
func (s *Subscriber) Stop(ctx context.Context) {
	if s.cancel != nil {
		s.cancel()
	}
	select {
	case <-s.done:
	case <-ctx.Done():
	case <-time.After(3 * time.Second):
	}
}
