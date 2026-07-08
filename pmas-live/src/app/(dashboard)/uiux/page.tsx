"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

interface DesignToken {
  id: number;
  category: string;
  token_data: unknown;
}

interface UIAsset {
  id: number;
  name: string;
  size: string;
  cdn_status: string;
  date: string;
}

function parseTokenJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Token JSON is invalid");
  }
}

export default function UIUXPage() {
  const qc = useQueryClient();

  const { data: tokensRaw, isLoading: tokensLoading } = useQuery({
    queryKey: ["design-tokens"],
    queryFn: () => httpClient.get<DesignToken[] | Record<string, unknown>>("/api/v1/uiux/tokens"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const tokens: DesignToken[] = Array.isArray(tokensRaw) ? tokensRaw : [];

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ["ui-assets"],
    queryFn: () => httpClient.get<UIAsset[]>("/api/v1/uiux/assets"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createToken = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/uiux/tokens", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["design-tokens"] }),
  });
  const updateToken = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/uiux/tokens/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["design-tokens"] }),
  });
  const deleteToken = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/uiux/tokens/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["design-tokens"] }),
  });

  const createAsset = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/uiux/assets", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ui-assets"] }),
  });
  const updateAsset = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/uiux/assets/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ui-assets"] }),
  });
  const deleteAsset = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/uiux/assets/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ui-assets"] }),
  });
  const pushAsset = useMutation({
    mutationFn: (asset_name: string) =>
      httpClient.post("/api/v1/uiux/assets/push", { asset_name }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ui-assets"] }),
  });

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="uiux"
        title="UI/UX workboard"
        description="Design tasks, todos, and status checkpoints for this department."
      />

      <ResourceManager
        title="Design Tokens"
        description="Typography and color tokens that power your design system."
        createLabel="Add token set"
        emptyTitle="No design tokens"
        emptyDescription="Add a colors or typography token category as JSON."
        isLoading={tokensLoading}
        items={tokens}
        columns={[
          { key: "category", label: "Category" },
          {
            key: "token_data",
            label: "Preview",
            render: (r) => (
              <code className="font-mono" style={{ fontSize: "0.75rem" }}>
                {JSON.stringify(r.token_data ?? {}).slice(0, 80)}…
              </code>
            ),
          },
        ]}
        fields={[
          {
            name: "category",
            label: "Category",
            required: true,
            type: "select",
            options: [
              { value: "colors", label: "Colors" },
              { value: "typography", label: "Typography" },
              { value: "spacing", label: "Spacing" },
            ],
          },
          {
            name: "token_data",
            label: "Token JSON",
            type: "textarea",
            required: true,
            placeholder: '{"primary":"#6366f1"}',
          },
        ]}
        toFormValues={(r) => ({
          category: r.category,
          token_data: JSON.stringify(r.token_data ?? {}, null, 2),
        })}
        onCreate={async (v) => {
          await createToken.mutateAsync({
            category: v.category,
            token_data: parseTokenJSON(v.token_data),
          });
        }}
        onUpdate={async (id, v) => {
          await updateToken.mutateAsync({
            id,
            body: { category: v.category, token_data: parseTokenJSON(v.token_data) },
          });
        }}
        onDelete={async (id) => {
          await deleteToken.mutateAsync(id);
        }}
      />

      <ResourceManager
        title="UI Assets"
        description="Track design assets and CDN sync status."
        createLabel="Add asset"
        emptyTitle="No UI assets"
        emptyDescription="Register logos, illustrations, and font subsets for CDN delivery."
        isLoading={assetsLoading}
        items={Array.isArray(assets) ? assets : []}
        columns={[
          { key: "name", label: "Name" },
          { key: "size", label: "Size" },
          { key: "cdn_status", label: "CDN" },
          { key: "date", label: "Date" },
        ]}
        fields={[
          { name: "name", label: "Asset name", required: true },
          { name: "size", label: "Size", required: true, placeholder: "12 KB" },
          {
            name: "cdn_status",
            label: "CDN status",
            type: "select",
            options: [
              { value: "Pending Sync", label: "Pending Sync" },
              { value: "Syncing...", label: "Syncing..." },
              { value: "Live", label: "Live" },
            ],
          },
          { name: "date", label: "Date", placeholder: "Jul 08, 2026" },
        ]}
        toFormValues={(r) => ({
          name: r.name,
          size: r.size,
          cdn_status: r.cdn_status,
          date: r.date,
        })}
        extraActions={(r) =>
          r.cdn_status !== "Live" ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void pushAsset.mutateAsync(r.name)}
            >
              Push CDN
            </button>
          ) : null
        }
        onCreate={async (v) => {
          await createAsset.mutateAsync({
            name: v.name,
            size: v.size || "0 KB",
            cdn_status: v.cdn_status || "Pending Sync",
            date: v.date || new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
          });
        }}
        onUpdate={async (id, v) => {
          await updateAsset.mutateAsync({
            id,
            body: {
              name: v.name,
              size: v.size,
              cdn_status: v.cdn_status,
              date: v.date,
            },
          });
        }}
        onDelete={async (id) => {
          await deleteAsset.mutateAsync(id);
        }}
      />
    </div>
  );
}
