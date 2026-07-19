"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PmasLoader } from "@/components/PmasLoader";

export default function LoginRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/welcome#login");
  }, [router]);

  return <PmasLoader message="Redirecting…" />;
}
