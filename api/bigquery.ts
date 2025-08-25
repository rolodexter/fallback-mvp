import { BigQuery } from '@google-cloud/bigquery';

// Vercel Node runtime configuration
export const config = { runtime: "nodejs" };

// Define types for Vercel API handlers (without depending on Next.js)
type NextApiRequest = {
  body: any;
  query: Record<string, string | string[]>;
  method: string;
};

type NextApiResponse = {
  status: (code: number) => NextApiResponse;
  json: (body: any) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};
import * as fs from 'fs';
import * as path from 'path';

// Lazily initialize BigQuery client only when executing queries (to avoid Stage-A init)

// Helper: decode inline or base64-encoded service account JSON
type ServiceAccountKey = {
  client_email?: string;
  private_key?: string;
  [k: string]: any;
};

function getCredentials(): ServiceAccountKey | undefined {
  const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const alt = process.env.GOOGLE_APPLICATION_CREDENTIALS; // may be raw JSON, base64, or a file path

  const tryParse = (s: string): ServiceAccountKey | undefined => {
    try {
      return JSON.parse(s) as ServiceAccountKey;
    } catch {
      try {
        const decoded = Buffer.from(s, 'base64').toString('utf8');
        return JSON.parse(decoded) as ServiceAccountKey;
      } catch {
        return undefined;
      }
    }
  };

  if (inlineJson) {
    const creds = tryParse(inlineJson);
    if (creds) return creds;
  }

  if (alt) {
    // First, attempt to parse as raw/base64 JSON
    const parsed = tryParse(alt);
    if (parsed) return parsed;

    // Otherwise, treat as file path if it exists
    try {
      const resolved = path.isAbsolute(alt) ? alt : path.resolve(alt);
      if (fs.existsSync(resolved)) {
        const contents = fs.readFileSync(resolved, 'utf8');
        return JSON.parse(contents) as ServiceAccountKey;
      }
    } catch {
      // ignore and fall through
    }
  }

  return undefined;
}

interface BigQueryRequest {
  template_id: string;
  params?: Record<string, any>;
}

interface BigQueryResponse {
  success: boolean;
  rows?: any[];
  diagnostics?: {
    message?: string;
    error?: string;
    template_id?: string;
    params?: Record<string, any>;
    query?: string;
  };
}

// Function to read SQL file
const readSqlTemplate = (templateId: string): string => {
  try {
    // Calculate base path (different in production vs development)
    const basePath = process.env.VERCEL
      ? path.join(process.cwd())
      : path.resolve('./');
    
    const sqlPath = path.join(basePath, 'sql', `${templateId}.sql`);
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read SQL template ${templateId}: ${errorMessage}`);
  }
};

// Deprecated: parameter substitution is now handled by BigQuery named params
// (kept for reference, not used)
const prepareSql = (sqlTemplate: string): string => sqlTemplate;

// Execute BigQuery
const executeBigQuery = async (
  templateId: string,
  params: Record<string, any> = {}
): Promise<BigQueryResponse> => {
  const t0 = Date.now();
  try {
    // Build client options from environment
    const projectId = process.env.GOOGLE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    const creds = getCredentials();
    const clientOptions: Record<string, any> = {};
    if (projectId) clientOptions.projectId = projectId;
    if (creds?.client_email && creds?.private_key) {
      clientOptions.credentials = {
        client_email: creds.client_email,
        private_key: creds.private_key,
      };
    }
    const bigquery = new BigQuery(clientOptions);
    // Get SQL template
    const sqlTemplate = readSqlTemplate(templateId);
    
    // Execute query with default dataset and location if provided
    const defaultDataset = process.env.BQ_DEFAULT_DATASET;
    const location = process.env.BQ_LOCATION;
    const [rows, job, apiResponse] = await bigquery.query({
      query: sqlTemplate,
      params: params,
      location: location || undefined,
      defaultDataset: defaultDataset
        ? { datasetId: defaultDataset, projectId: projectId || undefined }
        : undefined,
      useLegacySql: false,
    } as any);
    
    const ms = Date.now() - t0;
    const jobId = (job as any)?.id || (apiResponse as any)?.jobReference?.jobId || undefined;
    
    return {
      success: true,
      rows,
      diagnostics: {
        template_id: templateId,
        params,
        query: sqlTemplate,
        ms,
        jobId,
        dataset: defaultDataset,
        location: location || undefined,
      }
    };
  } catch (error: unknown) {
    console.error(`BigQuery execution error:`, error);
    const ms = Date.now() - t0;
    return {
      success: false,
      rows: [],
      diagnostics: {
        message: 'Failed to execute BigQuery',
        error: error instanceof Error ? error.message : String(error),
        template_id: templateId,
        params,
        ms,
      }
    };
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Stage-A guard: only allow BigQuery when explicitly set to 'bq'
  const dataMode = process.env.DATA_MODE ?? 'mock';
  if (dataMode !== 'bq') {
    res.status(200).json({ mode: 'abstain', provenance: { source: 'mock' } });
    return;
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      diagnostics: { message: 'Method not allowed' }
    });
    return;
  }
  
  try {
    // Parse request body
    const { template_id, params = {} } = req.body as BigQueryRequest;
    
    if (!template_id) {
      res.status(400).json({
        success: false,
        diagnostics: { message: 'Missing required parameter: template_id' }
      });
      return;
    }
    
    // Set default year parameter if not provided
    if (!params.year) {
      // Default to current year - 1 to ensure complete data
      params.year = new Date().getFullYear() - 1;
    }
    
    // Set default limit for customers query if not provided
    if (template_id === 'customers_top_n' && !params.limit) {
      params.limit = 5;
    }
    
    // Execute BigQuery
    const result = await executeBigQuery(template_id, params);
    
    // Return response
    res.status(result.success ? 200 : 500).json(result);
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      diagnostics: {
        message: 'Server error',
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}
