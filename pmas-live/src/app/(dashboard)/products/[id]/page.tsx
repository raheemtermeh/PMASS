"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ProductDetailClient } from "@/features/products/ProductDetailClient";
import { useI18n } from "@/core/providers/I18nProvider";

function ProductDetailPageInner() {
  const params = useParams<{ id: string }>();
  return <ProductDetailClient productId={params.id} />;
}

export default function ProductDetailPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<p className="text-dim">{t("productDetail.loading")}</p>}>
      <ProductDetailPageInner />
    </Suspense>
  );
}
