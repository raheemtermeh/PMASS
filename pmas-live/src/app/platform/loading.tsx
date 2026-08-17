"use client";

import { PmasLoader } from "@/components/PmasLoader";
import { useI18n } from "@/core/providers/I18nProvider";

export default function PlatformLoading() {
  const { t } = useI18n();
  return <PmasLoader message={t("loading.platform")} />;
}