"use client";

import { PmasLoader } from "@/components/PmasLoader";
import { useI18n } from "@/core/providers/I18nProvider";

export default function RootLoading() {
  const { t } = useI18n();
  return <PmasLoader message={t("loading.root")} />;
}
