"use client";

import { Suspense } from "react";
import PlanningClient from "./PlanningClient";

export default function PlanningRoute() {
  return (
    <Suspense fallback={<p className="text-dim">Loading planning…</p>}>
      <PlanningClient />
    </Suspense>
  );
}
