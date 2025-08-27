import { BigQuery } from "@google-cloud/bigquery";

export function makeBQ() {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!projectId || !creds) throw new Error("BQ_MISCONFIGURED");

  const client = new BigQuery({ projectId, credentials: JSON.parse(creds) });

  async function query(sql: string, params: Record<string, any>) {
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
        ms: Number(meta.statistics?.endTime) - Number(meta.statistics?.startTime)
      }
    };
  }

  async function ready() {
    try { 
      const r = await query("SELECT 1 AS ok", {}); 
      return { ok: !!r.rows?.length }; 
    }
    catch (e:any) { 
      return { ok: false, error: String(e?.message||e) }; 
    }
  }

  return { query, ready };
}

export async function runBQOrReport(bq: ReturnType<typeof makeBQ>, sql: string, params: any) {
  try {
    const r = await bq.query(sql, params);
    return { rows: r.rows ?? [], prov: { source: "bq", ...r.jobStats } };
  } catch (e:any) {
    return { rows: [], prov: { source: "bq", tag: "BQ_ERROR", error_msg: String(e?.message||e) } };
  }
}
