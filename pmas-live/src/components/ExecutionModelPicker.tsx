"use client";

import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import type { WorkModelDefinition } from "@/features/vsm/types";
import { cascadeLabels } from "@/features/products/work-models";

interface ExecutionModelPickerProps {
  model: string;
  customLevelsJson: string;
  onModelChange: (model: string) => void;
  onCustomLevelsChange: (json: string) => void;
  /** When true, picker is read-only (locked). */
  locked?: boolean;
}

function parseCustomLevels(json: string): string[] {
  try {
    const parsed = JSON.parse(json || "[]") as { label?: string }[];
    if (!Array.isArray(parsed)) return ["Level 1", "Level 2"];
    const labels = parsed.map((x) => (x.label || "").trim()).filter(Boolean);
    return labels.length ? labels : ["Level 1", "Level 2"];
  } catch {
    return ["Level 1", "Level 2"];
  }
}

function toCustomJson(labels: string[]): string {
  return JSON.stringify(labels.map((label) => ({ label })));
}

/** Card grid for catalog work models + custom level editor. */
export function ExecutionModelPicker({
  model,
  customLevelsJson,
  onModelChange,
  onCustomLevelsChange,
  locked,
}: ExecutionModelPickerProps) {
  const { t } = useI18n();
  const { data: catalog = [] } = useQuery({
    queryKey: ["execution-models"],
    queryFn: () => httpClient.get<WorkModelDefinition[]>("/api/v1/execution-models"),
    staleTime: 300_000,
  });

  const customLabels = parseCustomLevels(customLevelsJson);

  function setCustomLabel(index: number, label: string) {
    const next = [...customLabels];
    next[index] = label;
    onCustomLevelsChange(toCustomJson(next));
  }

  function addCustomLevel() {
    if (customLabels.length >= 3) return;
    onCustomLevelsChange(toCustomJson([...customLabels, `Level ${customLabels.length + 1}`]));
  }

  function removeCustomLevel(index: number) {
    if (customLabels.length <= 1) return;
    onCustomLevelsChange(toCustomJson(customLabels.filter((_, i) => i !== index)));
  }

  return (
    <div className={`exec-model-picker${locked ? " locked" : ""}`}>
      <div className="exec-model-picker-head">
        <strong>{t("workModels.pickerTitle")}</strong>
        <span className="text-dim">{locked ? t("workModels.lockedHint") : t("workModels.pickerHint")}</span>
      </div>
      <div className="exec-model-grid" role="listbox" aria-label={t("workModels.pickerTitle")}>
        {catalog.map((def) => {
          const selected = model === def.key;
          const name = t(`workModels.${def.key}.name`);
          const desc = t(`workModels.${def.key}.description`);
          const chips =
            def.key === "CUSTOM"
              ? customLabels.join(" → ")
              : cascadeLabels({ levels: def.levels }) ||
                (name.startsWith("workModels.") ? def.name : name);
          return (
            <button
              key={def.key}
              type="button"
              role="option"
              aria-selected={selected}
              className={`exec-model-card${selected ? " selected" : ""}`}
              disabled={locked}
              onClick={() => onModelChange(def.key)}
            >
              <strong>{name.startsWith("workModels.") ? def.name : name}</strong>
              <span className="exec-model-desc">
                {desc.startsWith("workModels.") ? def.description : desc}
              </span>
              <span className="exec-model-chips">{chips}</span>
            </button>
          );
        })}
      </div>

      {model === "CUSTOM" && !locked ? (
        <div className="exec-model-custom">
          <p className="text-dim" style={{ fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
            {t("workModels.customEditorHint")}
          </p>
          <ul className="exec-model-custom-list">
            {customLabels.map((label, index) => (
              <li key={index}>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setCustomLabel(index, e.target.value)}
                  aria-label={t("workModels.levelLabel", { n: index + 1 })}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={customLabels.length <= 1}
                  onClick={() => removeCustomLevel(index)}
                >
                  {t("common.remove")}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-sm"
            disabled={customLabels.length >= 3}
            onClick={addCustomLevel}
          >
            {t("workModels.addLevel")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
