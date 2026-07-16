"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/welcome#login");
  }, [router]);

  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
      <p>Redirecting…</p>
    </div>
  );
}
