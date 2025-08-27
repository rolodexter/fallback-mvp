// Define data mode types that will be used across the application
export type DataMode = "mock" | "live";

export function getDataMode(): DataMode {
  const raw = String(process.env.DATA_MODE || "mock").toLowerCase();
  return (raw === "bq" || raw === "live") ? "live" : "mock";
}

export function allowMockFallback(): boolean {
  const v = String(process.env.ALLOW_MOCK_FALLBACK ?? "0").trim().toLowerCase();
  return v === "1" || v === "true";
}

export const WANT_LIVE = () => getDataMode() === "live";
