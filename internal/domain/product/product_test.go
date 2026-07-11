package product_test

import (
	"testing"

	"github.com/google/uuid"

	"PMAS/internal/domain/product"
)

func TestProduct_ExecutionModelLocked(t *testing.T) {
	p, err := product.NewProduct(uuid.New(), uuid.New(), "Demo", "", "", product.ExecutionProjectFeatureTask)
	if err != nil {
		t.Fatal(err)
	}
	if err := p.ChangeExecutionModel(product.ExecutionDirectTask); err != product.ErrExecutionModelLocked {
		t.Fatalf("expected EXECUTION_MODEL_LOCKED, got %v", err)
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
