import type { Handler } from '@netlify/functions';

// Non-sensitive environment health endpoint
// Shows presence/shape-only details required for live BigQuery mode
// Does NOT echo secret values.
export const handler: Handler = async () => {
  try {
    // Normalize data mode
    const rawMode = String(process.env.DATA_MODE ?? '').trim().toLowerCase();
    const data_mode = (rawMode === 'bq' || rawMode === 'live') ? 'live' : 'mock';

    // LLM provider + key presence
    const llm_provider = String(process.env.LLM_PROVIDER ?? process.env.PROVIDER ?? 'perplexity').trim().toLowerCase();
    const has_pplx_key = Boolean((process.env.PERPLEXITY_API_KEY ?? process.env.PPLX_API_KEY ?? '').trim());

    // Google project and credential mode presence (no values echoed)
    const has_project = Boolean((process.env.GOOGLE_PROJECT_ID ?? '').trim());

    const cred_json = (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? '').trim();
    const cred_b64  = (process.env.GOOGLE_APPLICATION_CREDENTIALS_B64 ?? '').trim();
    const cred_file = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim();
    let cred_mode: 'json' | 'b64' | 'file' | 'none' = 'none';
    if (cred_json) cred_mode = 'json'; else if (cred_b64) cred_mode = 'b64'; else if (cred_file) cred_mode = 'file';

    const allow_mock_fallback_raw = String(process.env.ALLOW_MOCK_FALLBACK ?? '0').trim().toLowerCase();
    const allow_mock_fallback = allow_mock_fallback_raw === '1' || allow_mock_fallback_raw === 'true';

    // Compute missing for live readiness
    const missing: string[] = [];
    if (data_mode === 'live') {
      if (!has_project) missing.push('GOOGLE_PROJECT_ID');
      if (cred_mode === 'none') missing.push('GOOGLE_APPLICATION_CREDENTIALS_[JSON|B64|FILE]');
      if (llm_provider === 'perplexity' && !has_pplx_key) missing.push('PERPLEXITY_API_KEY/PPLX_API_KEY');
    }

    const body = {
      ok: true,
      platform: 'netlify',
      data_mode,
      allow_mock_fallback,
      llm_provider,
      has_perplexity_key: has_pplx_key,
      google_project_present: has_project,
      credential_mode: cred_mode,
      ready_for_live: data_mode === 'live' ? missing.length === 0 : false,
      missing: missing.length ? missing : undefined,
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(body)
    };
  } catch (e: any) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ ok: false, error: String(e?.message || e), timestamp: new Date().toISOString() })
    };
  }
};
