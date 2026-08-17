"use client";

import { Suspense } from "react";
import { useI18n } from "@/core/providers/I18nProvider";
import PlanningClient from "./PlanningClient";

export default function PlanningRoute() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<p className="text-dim">{t("planning.loadingPlanning")}</p>}>
      <PlanningClient />
    </Suspense>
  );
}
