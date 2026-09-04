package observability

import (
	"expvar"
	"runtime"
	"sync/atomic"
	"time"
)

const (
	bucketCount = 10
)

// latency buckets in milliseconds: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, +Inf
var latencyBounds = [...]int64{5, 10, 25, 50, 100, 250, 500, 1000, 2500}

type Metrics struct {
	requests     atomic.Int64
	inFlight     atomic.Int64
	status4xx    atomic.Int64
	status5xx    atomic.Int64
	latencyCount atomic.Int64
	latencySumMS atomic.Int64
	buckets      [bucketCount]atomic.Int64
	started      time.Time
}

func NewMetrics() *Metrics {
	m := &Metrics{started: time.Now()}
	expvar.Publish("pmas_requests", expvar.Func(func() any { return m.requests.Load() }))
	expvar.Publish("pmas_in_flight", expvar.Func(func() any { return m.inFlight.Load() }))
	return m
}

func (m *Metrics) BeginRequest() { m.inFlight.Add(1) }

func (m *Metrics) EndRequest(status int, dur time.Duration) {
	m.inFlight.Add(-1)
	m.requests.Add(1)
	if status >= 500 {
		m.status5xx.Add(1)
	} else if status >= 400 {
		m.status4xx.Add(1)
	}
	ms := dur.Milliseconds()
	if ms < 0 {
		ms = 0
	}
	m.latencyCount.Add(1)
	m.latencySumMS.Add(ms)
	placed := false
	for i, bound := range latencyBounds {
		if ms <= bound {
			m.buckets[i].Add(1)
			placed = true
			break
		}
	}
	if !placed {
		m.buckets[bucketCount-1].Add(1)
	}
}

func (m *Metrics) Snapshot(dbStats any, goroutines int, mem runtime.MemStats) map[string]any {
	count := m.latencyCount.Load()
	sum := m.latencySumMS.Load()
	avg := int64(0)
	if count > 0 {
		avg = sum / count
	}
	elapsed := time.Since(m.started).Seconds()
	rps := 0.0
	if elapsed > 0 {
		rps = float64(m.requests.Load()) / elapsed
	}
	return map[string]any{
		"requests":         m.requests.Load(),
		"requests_per_sec": rps,
		"in_flight":        m.inFlight.Load(),
		"status_4xx":       m.status4xx.Load(),
		"status_5xx":       m.status5xx.Load(),
		"latency_ms": map[string]any{
			"avg":   avg,
			"p50":   m.percentile(50),
			"p95":   m.percentile(95),
			"p99":   m.percentile(99),
			"count": count,
		},
		"goroutines": goroutines,
		"memory": map[string]any{
			"alloc_bytes":      mem.Alloc,
			"heap_alloc_bytes": mem.HeapAlloc,
			"sys_bytes":        mem.Sys,
			"num_gc":           mem.NumGC,
		},
		"db":         dbStats,
		"uptime_sec": elapsed,
	}
}

func (m *Metrics) percentile(p int) int64 {
	total := m.latencyCount.Load()
	if total == 0 {
		return 0
	}
	target := (int64(p)*total + 99) / 100
	if target < 1 {
		target = 1
	}
	var acc int64
	for i := 0; i < bucketCount; i++ {
		acc += m.buckets[i].Load()
		if acc >= target {
			if i < len(latencyBounds) {
				return latencyBounds[i]
			}
			return latencyBounds[len(latencyBounds)-1] * 2
		}
	}
	return latencyBounds[len(latencyBounds)-1] * 2
}
