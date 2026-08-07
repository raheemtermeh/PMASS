"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PmasLoader } from "@/components/PmasLoader";
import { useI18n } from "@/core/providers/I18nProvider";

export default function LoginRedirectPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    router.replace("/welcome#login");
  }, [router]);

  return <PmasLoader message={t("auth.redirecting")} />;
}
