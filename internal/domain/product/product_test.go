package product_test

import (
	"testing"

	"github.com/google/uuid"

	"PMAS/internal/domain/product"
)

func TestProduct_ExecutionModelLockedWhenCannotChange(t *testing.T) {
	p, err := product.NewProduct(uuid.New(), uuid.New(), "Demo", "", "", product.ExecutionProjectFeatureTask)
	if err != nil {
		t.Fatal(err)
	}
	if err := p.ChangeExecutionModel(product.ExecutionDirectTask, nil, false); err != product.ErrExecutionModelLocked {
		t.Fatalf("expected EXECUTION_MODEL_LOCKED, got %v", err)
	}
}

func TestProduct_ExecutionModelChangeWhenUnlocked(t *testing.T) {
	p, err := product.NewProduct(uuid.New(), uuid.New(), "Demo", "", "", product.ExecutionProjectFeatureTask)
	if err != nil {
		t.Fatal(err)
	}
	if err := p.ChangeExecutionModel(product.ExecutionScrum, nil, true); err != nil {
		t.Fatal(err)
	}
	if p.ExecutionModel != product.ExecutionScrum {
		t.Fatalf("model=%s", p.ExecutionModel)
	}
	cfg := p.ResolvedConfig()
	if len(cfg.Levels) != 3 || cfg.Levels[0].Label != "Epic" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestResolveConfig_Presets(t *testing.T) {
	cases := []struct {
		key      string
		storages []string
	}{
		{product.ExecutionProjectFeatureTask, []string{"project", "feature", "task"}},
		{product.ExecutionScrum, []string{"project", "feature", "task"}},
		{product.ExecutionKanban, []string{"project", "task"}},
		{product.ExecutionFeatureTask, []string{"feature", "task"}},
		{product.ExecutionDirectTask, []string{"task"}},
		{product.ExecutionOKRs, []string{"project", "feature", "task"}},
	}
	for _, tc := range cases {
		cfg, err := product.ResolveConfig(tc.key, nil)
		if err != nil {
			t.Fatalf("%s: %v", tc.key, err)
		}
		if len(cfg.Levels) != len(tc.storages) {
			t.Fatalf("%s: got %d levels", tc.key, len(cfg.Levels))
		}
		for i, s := range tc.storages {
			if cfg.Levels[i].Storage != s {
				t.Fatalf("%s[%d]=%s want %s", tc.key, i, cfg.Levels[i].Storage, s)
			}
		}
	}
}

func TestResolveConfig_Custom(t *testing.T) {
	cfg, err := product.ResolveConfig(product.ExecutionCustom, []product.CustomLevelInput{
		{Label: "Theme"},
		{Label: "Ticket"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Levels) != 2 || cfg.Levels[0].Storage != "feature" || cfg.Levels[1].Storage != "task" {
		t.Fatalf("%+v", cfg)
	}
	_, err = product.ResolveConfig(product.ExecutionCustom, nil)
	if err != product.ErrInvalidCustomLevels {
		t.Fatalf("expected invalid custom, got %v", err)
	}
}

func TestProduct_NameRequired(t *testing.T) {
	_, err := product.NewProduct(uuid.New(), uuid.New(), "  ", "", "", "")
	if err != product.ErrProductNameRequired {
		t.Fatalf("expected name required, got %v", err)
	}
}

func TestStageInstance_RejectRequiresReason(t *testing.T) {
	si := product.NewStageInstance(uuid.New(), uuid.New(), uuid.New(), nil)
	if err := si.Reject("  "); err != product.ErrRejectReasonRequired {
		t.Fatalf("expected reject reason required, got %v", err)
	}
}

func TestStageInstance_ExitCriteria(t *testing.T) {
	si := product.NewStageInstance(uuid.New(), uuid.New(), uuid.New(), nil)
	if err := si.Complete(false); err != product.ErrExitCriteriaFailed {
		t.Fatalf("expected exit criteria failed, got %v", err)
	}
	if err := si.Complete(true); err != nil {
		t.Fatal(err)
	}
	if si.Status != product.StageCompleted {
		t.Fatalf("status=%s", si.Status)
	}
}

func TestOnlyOneActiveSemantics_RejectThenCannotComplete(t *testing.T) {
	si := product.NewStageInstance(uuid.New(), uuid.New(), uuid.New(), nil)
	if err := si.Reject("blocked by compliance"); err != nil {
		t.Fatal(err)
	}
	if err := si.Complete(true); err != product.ErrInvalidStageStatus {
		t.Fatalf("expected invalid status, got %v", err)
	}
}
