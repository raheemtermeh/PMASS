"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ProductDetailClient } from "@/features/products/ProductDetailClient";

function ProductDetailPageInner() {
  const params = useParams<{ id: string }>();
  return <ProductDetailClient productId={params.id} />;
}

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<p className="text-dim">Loading product…</p>}>
      <ProductDetailPageInner />
    </Suspense>
  );
}
