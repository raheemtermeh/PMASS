"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";

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

function parseTokenJSON(raw: string, errorMessage: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(errorMessage);
  }
}

function localizedSize(
  value: string,
  n: (value: number) => string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const match = value.trim().match(/^([\d.]+)\s*KB$/i);
  return match
    ? t("uiux.sizeKilobytes", { value: n(Number(match[1])) })
    : value;
}

export default function UIUXPage() {
  const { t, n, d } = useI18n();
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
        title={t("uiux.workboard.title")}
        description={t("uiux.workboard.description")}
      />

      <ResourceManager
        title={t("uiux.tokens.title")}
        description={t("uiux.tokens.description")}
        createLabel={t("uiux.tokens.create")}
        emptyTitle={t("uiux.tokens.emptyTitle")}
        emptyDescription={t("uiux.tokens.emptyDescription")}
        isLoading={tokensLoading}
        items={tokens}
        columns={[
          { key: "category", label: t("uiux.fields.category"), render: (r) => t(`uiux.categories.${r.category}`) },
          {
            key: "token_data",
            label: t("uiux.fields.preview"),
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
            label: t("uiux.fields.category"),
            required: true,
            type: "select",
            options: [
              { value: "colors", label: t("uiux.categories.colors") },
              { value: "typography", label: t("uiux.categories.typography") },
              { value: "spacing", label: t("uiux.categories.spacing") },
            ],
          },
          {
            name: "token_data",
            label: t("uiux.fields.tokenJson"),
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
            token_data: parseTokenJSON(v.token_data, t("uiux.errors.invalidTokenJson")),
          });
        }}
        onUpdate={async (id, v) => {
          await updateToken.mutateAsync({
            id: Number(id),
            body: {
              category: v.category,
              token_data: parseTokenJSON(v.token_data, t("uiux.errors.invalidTokenJson")),
            },
          });
        }}
        onDelete={async (id) => {
          await deleteToken.mutateAsync(Number(id));
        }}
      />

      <ResourceManager
        title={t("uiux.assets.title")}
        description={t("uiux.assets.description")}
        createLabel={t("uiux.assets.create")}
        emptyTitle={t("uiux.assets.emptyTitle")}
        emptyDescription={t("uiux.assets.emptyDescription")}
        isLoading={assetsLoading}
        items={Array.isArray(assets) ? assets : []}
        columns={[
          { key: "name", label: t("uiux.fields.name") },
          {
            key: "size",
            label: t("uiux.fields.size"),
            render: (r) => localizedSize(r.size, n, t),
          },
          { key: "cdn_status", label: t("uiux.fields.cdn"), render: (r) => t(`uiux.cdnStatuses.${r.cdn_status.toLowerCase().replace(/[^a-z]/g, "")}`) },
          { key: "date", label: t("uiux.fields.date"), render: (r) => d(r.date) },
        ]}
        fields={[
          { name: "name", label: t("uiux.fields.assetName"), required: true },
          { name: "size", label: t("uiux.fields.size"), required: true, placeholder: t("uiux.placeholders.size") },
          {
            name: "cdn_status",
            label: t("uiux.fields.cdnStatus"),
            type: "select",
            options: [
              { value: "Pending Sync", label: t("uiux.cdnStatuses.pendingsync") },
              { value: "Syncing...", label: t("uiux.cdnStatuses.syncing") },
              { value: "Live", label: t("uiux.cdnStatuses.live") },
            ],
          },
          { name: "date", label: t("uiux.fields.date"), placeholder: t("uiux.placeholders.date") },
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
              {t("uiux.pushCdn")}
            </button>
          ) : null
        }
        onCreate={async (v) => {
          await createAsset.mutateAsync({
            name: v.name,
            size: v.size || "0 KB",
            cdn_status: v.cdn_status || "Pending Sync",
            date: v.date || new Date().toISOString().slice(0, 10),
          });
        }}
        onUpdate={async (id, v) => {
          await updateAsset.mutateAsync({
            id: Number(id),
            body: {
              name: v.name,
              size: v.size,
              cdn_status: v.cdn_status,
              date: v.date,
            },
          });
        }}
        onDelete={async (id) => {
          await deleteAsset.mutateAsync(Number(id));
        }}
      />
    </div>
  );
}
