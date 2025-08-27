import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";

function parseJsonLoose(s: string) {
  try { return JSON.parse(s); } catch {}
  try { return JSON.parse(Buffer.from(s, "base64").toString("utf8")); } catch {}
  try { return JSON.parse(JSON.parse(s)); } catch {}
  throw new Error("BQ_CREDS_NOT_JSON");
}

export function readServiceAccount() {
  const raw = (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || "").trim();
  const b64 = (process.env.GOOGLE_APPLICATION_CREDENTIALS_B64 || "").trim();
  const pth = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();

  if (raw) return parseJsonLoose(raw);
  if (b64) return parseJsonLoose(b64);
  if (pth) return parseJsonLoose(fs.readFileSync(pth, "utf8"));
  throw new Error("BQ_MISCONFIGURED_NO_CREDS");
}

export function makeBQ() {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) throw new Error("BQ_MISCONFIGURED_NO_PROJECT");
  
  // Get credential mode for provenance
  const raw = (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || "").trim();
  const b64 = (process.env.GOOGLE_APPLICATION_CREDENTIALS_B64 || "").trim();
  const pth = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  const cred_mode = raw ? "json" : b64 ? "b64" : pth ? "path" : "none";
  
  // Get build identifier
  const build = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NETLIFY_COMMIT_REF || "local";
  
  try {
    const credentials = readServiceAccount();
    const client = new BigQuery({ projectId, credentials });

    async function query(sql: string, params: Record<string, any>) {
      try {
        const [job] = await client.createQueryJob({
          query: sql,
          location: process.env.BQ_LOCATION || "US",
          params
        });
        const [rows] = await job.getQueryResults();
        const [meta] = await job.getMetadata();
        return {
          rows,
          jobStats: {
            bytesProcessed: meta.statistics?.query?.totalBytesProcessed,
            cacheHit: meta.statistics?.query?.cacheHit,
            ms: Number(meta.statistics?.endTime) - Number(meta.statistics?.startTime),
            cred_mode,
            build
          }
        };
      } catch (e: any) {
        console.error(`[BQ] Query failed: ${e?.message || e}`);
        throw e; // Let the caller handle this with runBQOrReport
      }
    }

    async function ready() {
      try { 
        const r = await query("SELECT 1 AS ok", {}); 
        return { ok: !!r.rows?.length, cred_mode, build }; 
      }
      catch (e: any) { 
        return { ok: false, error: String(e?.message || e), cred_mode, build }; 
      }
    }

    return { query, ready, cred_mode, build };
  } catch (e: any) {
    // Return a non-throwing mock client for graceful degradation
    console.error(`[BQ] Failed to initialize: ${e?.message || e}`);
    return {
      query: async () => ({ rows: [], jobStats: { error: String(e?.message || e), cred_mode, build } }),
      ready: async () => ({ ok: false, error: String(e?.message || e), cred_mode, build }),
      cred_mode,
      build
    };
  }
}

export async function runBQOrReport(bq: ReturnType<typeof makeBQ>, sql: string, params: any) {
  try {
    const r = await bq.query(sql, params);
    return { rows: r.rows ?? [], prov: { source: "bq", ...r.jobStats } };
  } catch (e:any) {
    return { rows: [], prov: { source: "bq", tag: "BQ_ERROR", error_msg: String(e?.message||e) } };
  }
}
