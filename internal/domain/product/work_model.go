package product

import (
	"encoding/json"
	"strconv"
	"strings"
)

// Storage layer keys map visible work-map levels onto existing planning tables.
const (
	StorageProject = "project"
	StorageFeature = "feature"
	StorageTask    = "task"
)

// Additional catalog keys beyond the original three.
const (
	ExecutionScrum  = "SCRUM"
	ExecutionKanban = "KANBAN"
	ExecutionOKRs   = "OKRS"
	ExecutionCustom = "CUSTOM"
)

// WorkLevel is one visible step in a product's delivery cascade.
type WorkLevel struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Storage string `json:"storage"` // project | feature | task
}

// ExecutionConfig is the resolved work map stored on the product.
type ExecutionConfig struct {
	Levels []WorkLevel `json:"levels"`
}

// WorkModelDefinition describes a catalog preset for the product picker.
type WorkModelDefinition struct {
	Key         string      `json:"key"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Levels      []WorkLevel `json:"levels"`
	Customizable bool       `json:"customizable,omitempty"`
}

// CustomLevelInput is a user-supplied label when creating a CUSTOM model.
type CustomLevelInput struct {
	Key   string `json:"key,omitempty"`
	Label string `json:"label"`
}

func (c ExecutionConfig) HasStorage(storage string) bool {
	for _, l := range c.Levels {
		if l.Storage == storage {
			return true
		}
	}
	return false
}

func (c ExecutionConfig) NeedsSystemProject() bool {
	return !c.HasStorage(StorageProject)
}

func (c ExecutionConfig) NeedsSystemFeature() bool {
	return !c.HasStorage(StorageFeature)
}

func (c ExecutionConfig) LabelForStorage(storage string) string {
	for _, l := range c.Levels {
		if l.Storage == storage {
			return l.Label
		}
	}
	return storage
}

func (c ExecutionConfig) Clone() ExecutionConfig {
	out := ExecutionConfig{Levels: make([]WorkLevel, len(c.Levels))}
	copy(out.Levels, c.Levels)
	return out
}

// MarshalJSONBytes encodes config for JSONB persistence.
func (c ExecutionConfig) MarshalJSONBytes() ([]byte, error) {
	if len(c.Levels) == 0 {
		return nil, nil
	}
	return json.Marshal(c)
}

// ParseExecutionConfig decodes JSONB; empty/null yields a zero config.
func ParseExecutionConfig(raw []byte) (ExecutionConfig, error) {
	if len(raw) == 0 {
		return ExecutionConfig{}, nil
	}
	var cfg ExecutionConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return ExecutionConfig{}, err
	}
	return cfg, nil
}

// Catalog returns well-known delivery models for the product manager picker.
func Catalog() []WorkModelDefinition {
	return []WorkModelDefinition{
		{
			Key:         ExecutionProjectFeatureTask,
			Name:        "Project → Feature → Task",
			Description: "Classic delivery cascade under a product.",
			Levels: []WorkLevel{
				{Key: "project", Label: "Project", Storage: StorageProject},
				{Key: "feature", Label: "Feature", Storage: StorageFeature},
				{Key: "task", Label: "Task", Storage: StorageTask},
			},
		},
		{
			Key:         ExecutionScrum,
			Name:        "Epic → Story → Task",
			Description: "Scrum / Agile backlog structure.",
			Levels: []WorkLevel{
				{Key: "epic", Label: "Epic", Storage: StorageProject},
				{Key: "story", Label: "Story", Storage: StorageFeature},
				{Key: "task", Label: "Task", Storage: StorageTask},
			},
		},
		{
			Key:         ExecutionKanban,
			Name:        "Initiative → Work Item",
			Description: "Lightweight Kanban: initiatives contain work items.",
			Levels: []WorkLevel{
				{Key: "initiative", Label: "Initiative", Storage: StorageProject},
				{Key: "work_item", Label: "Work Item", Storage: StorageTask},
			},
		},
		{
			Key:         ExecutionFeatureTask,
			Name:        "Feature → Task",
			Description: "Skip projects; features hang directly under the product.",
			Levels: []WorkLevel{
				{Key: "feature", Label: "Feature", Storage: StorageFeature},
				{Key: "task", Label: "Task", Storage: StorageTask},
			},
		},
		{
			Key:         ExecutionDirectTask,
			Name:        "Product → Task",
			Description: "Simplest model: assignable tasks under the product.",
			Levels: []WorkLevel{
				{Key: "task", Label: "Task", Storage: StorageTask},
			},
		},
		{
			Key:         ExecutionOKRs,
			Name:        "Objective → Key Result → Initiative",
			Description: "OKR-style planning mapped onto delivery work.",
			Levels: []WorkLevel{
				{Key: "objective", Label: "Objective", Storage: StorageProject},
				{Key: "key_result", Label: "Key Result", Storage: StorageFeature},
				{Key: "initiative", Label: "Initiative", Storage: StorageTask},
			},
		},
		{
			Key:          ExecutionCustom,
			Name:         "Custom",
			Description:  "Define 1–3 named levels that map onto the delivery stack.",
			Customizable: true,
			Levels:       nil,
		},
	}
}

// ResolveConfig builds the stored execution config for a model key.
// For CUSTOM, customLevels supplies 1–3 user labels (mapped onto trailing storage layers).
func ResolveConfig(modelKey string, customLevels []CustomLevelInput) (ExecutionConfig, error) {
	modelKey = strings.TrimSpace(strings.ToUpper(modelKey))
	if modelKey == "" {
		modelKey = ExecutionProjectFeatureTask
	}

	if modelKey == ExecutionCustom {
		return resolveCustom(customLevels)
	}

	for _, def := range Catalog() {
		if def.Key == modelKey && !def.Customizable {
			return ExecutionConfig{Levels: append([]WorkLevel(nil), def.Levels...)}, nil
		}
	}
	return ExecutionConfig{}, ErrInvalidExecutionModel
}

func resolveCustom(customLevels []CustomLevelInput) (ExecutionConfig, error) {
	if len(customLevels) < 1 || len(customLevels) > 3 {
		return ExecutionConfig{}, ErrInvalidCustomLevels
	}
	seen := map[string]bool{}
	labels := make([]string, 0, len(customLevels))
	keys := make([]string, 0, len(customLevels))
	for i, in := range customLevels {
		label := strings.TrimSpace(in.Label)
		if label == "" {
			return ExecutionConfig{}, ErrInvalidCustomLevels
		}
		low := strings.ToLower(label)
		if seen[low] {
			return ExecutionConfig{}, ErrInvalidCustomLevels
		}
		seen[low] = true
		labels = append(labels, label)
		key := strings.TrimSpace(strings.ToLower(in.Key))
		if key == "" {
			key = slugifyLevel(label, i)
		}
		keys = append(keys, key)
	}

	// Map onto trailing storage layers: 1→task, 2→feature+task, 3→project+feature+task.
	storages := []string{StorageProject, StorageFeature, StorageTask}
	offset := 3 - len(labels)
	levels := make([]WorkLevel, len(labels))
	for i, label := range labels {
		levels[i] = WorkLevel{
			Key:     keys[i],
			Label:   label,
			Storage: storages[offset+i],
		}
	}
	return ExecutionConfig{Levels: levels}, nil
}

func slugifyLevel(label string, index int) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(label)) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' || r == '_' {
			b.WriteByte('_')
		}
	}
	s := strings.Trim(b.String(), "_")
	if s == "" {
		return "level_" + strconv.Itoa(index+1)
	}
	return s
}

// EffectiveConfig returns stored config, or derives it from the model key when JSON is empty
// (backward compatible with products created before execution_config existed).
func EffectiveConfig(modelKey string, stored *ExecutionConfig) ExecutionConfig {
	if stored != nil && len(stored.Levels) > 0 {
		return stored.Clone()
	}
	cfg, err := ResolveConfig(modelKey, nil)
	if err != nil {
		cfg, _ = ResolveConfig(ExecutionProjectFeatureTask, nil)
	}
	return cfg
}

func init() {
	// Expand the create-time allow-list used by NewProduct.
	ValidExecutionModels[ExecutionScrum] = true
	ValidExecutionModels[ExecutionKanban] = true
	ValidExecutionModels[ExecutionOKRs] = true
	ValidExecutionModels[ExecutionCustom] = true
}
