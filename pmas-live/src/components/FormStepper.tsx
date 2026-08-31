"use client";

interface Step {
  id: string;
  label: string;
}

interface FormStepperProps {
  steps: Step[];
  current: number;
  onStepClick?: (index: number) => void;
}

/** Visual stepper for multi-step create/edit flows. */
export function FormStepper({ steps, current, onStepClick }: FormStepperProps) {
  return (
    <nav className="form-stepper" aria-label="Form steps">
      <ol className="form-stepper-list">
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
          return (
            <li key={step.id} className={`form-stepper-item ${state}`}>
              <button
                type="button"
                className="form-stepper-btn"
                disabled={!onStepClick || i > current}
                onClick={() => onStepClick?.(i)}
                aria-current={i === current ? "step" : undefined}
              >
                <span className="form-stepper-num" aria-hidden>
                  {i < current ? "✓" : i + 1}
                </span>
                <span className="form-stepper-label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
