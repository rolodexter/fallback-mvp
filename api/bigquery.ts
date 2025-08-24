import { BigQuery } from '@google-cloud/bigquery';

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

// Replace parameters in SQL
const prepareSql = (sqlTemplate: string, params: Record<string, any> = {}): string => {
  let preparedSql = sqlTemplate;
  
  // Replace all @param placeholders with values or defaults
  for (const [key, value] of Object.entries(params)) {
    const paramPlaceholder = `@${key}`;
    preparedSql = preparedSql.replace(
      new RegExp(paramPlaceholder, 'g'),
      typeof value === 'string' ? `'${value}'` : value
    );
  }
  
  return preparedSql;
};

// Execute BigQuery
const executeBigQuery = async (
  templateId: string,
  params: Record<string, any> = {}
): Promise<BigQueryResponse> => {
  try {
    const bigquery = new BigQuery();
    // Get SQL template
    const sqlTemplate = readSqlTemplate(templateId);
    
    // Prepare SQL with parameters
    const sqlQuery = prepareSql(sqlTemplate, params);
    
    // Execute query
    const [rows] = await bigquery.query({ query: sqlQuery });
    
    return {
      success: true,
      rows,
      diagnostics: {
        template_id: templateId,
        params,
        query: sqlQuery
      }
    };
  } catch (error: unknown) {
    console.error(`BigQuery execution error:`, error);
    return {
      success: false,
      rows: [],
      diagnostics: {
        message: 'Failed to execute BigQuery',
        error: error instanceof Error ? error.message : String(error),
        template_id: templateId,
        params
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
