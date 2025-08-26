import { BigQuery } from '@google-cloud/bigquery';
import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';
import { getCache, generateStableHash } from '../src/lib/cache';

// Initialize BigQuery client
const bigquery = new BigQuery();

// Check data mode: 'bq' or 'mock'
const dataMode = (process.env.DATA_MODE || 'mock').toLowerCase();

// Mock data fallback is now deprecated
// We'll always return clear errors when data is unavailable instead of showing mock data
const allowMockFallback = false;

// Define allowed templates with optional parameter validation
const ALLOWED_TEMPLATES = [
  'metric_snapshot_year_v1',
  'metric_timeseries_v1',
  'monthly_gross_trend_v1',
  'business_units_list_v1',
  'business_units_snapshot_yoy_v1',
  'top_counterparties_gross_v1',
  'customers_top_n',
  'metric_breakdown_by_unit_v1',
  'business_risk_assessment_v1'
];

// Define available data ranges
const DATA_AVAILABILITY = {
  yearStart: 2020, // Earliest year with available data
  yearEnd: new Date().getFullYear() - 1, // Last complete year
  monthStart: 1, // First month with available data (1-indexed)
  monthEnd: new Date().getMonth(), // Current month (0-indexed, so adding 1 later)
};

interface BigQueryRequest {
  template_id: string;
  params?: Record<string, any>;
}

interface BigQueryResponse {
  success: boolean;
  rows?: any[];
  source?: 'bq' | 'mock'; // Indicate data source
  diagnostics?: {
    message?: string;
    error?: string;
    template_id?: string;
    params?: Record<string, any>;
    query?: string;
    bytesProcessed?: number;
    jobId?: string;
    cacheHit?: boolean;
    executionTime?: number;
    allow_mock_fallback?: boolean; // Indicate if mock fallback is allowed
  };
}

// Function to read SQL file
const readSqlTemplate = (templateId: string): string => {
  try {
    // Calculate path based on whether we're in a bundled function or development
    let basePath = '';
    
    // In production/Netlify
    if (process.env.LAMBDA_TASK_ROOT) {
      basePath = path.join(process.env.LAMBDA_TASK_ROOT, '../');
    } else {
      // In development
      basePath = path.resolve(__dirname, '../');
    }
    
    const sqlPath = path.join(basePath, 'sql', `${templateId}.sql`);
    return fs.readFileSync(sqlPath, 'utf8');
  } catch (error) {
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
    // Initialize cache
    const cache = await getCache();
    
    // Generate stable cache key from template_id and params
    const paramsHash = generateStableHash(params);
    const cacheKey = `bq:${templateId}:${paramsHash}`;
    
    // Try to get from cache first
    const cachedResult = await cache.get(cacheKey);
    
    if (cachedResult) {
      console.log(`Cache hit for ${templateId}`);
      return {
        success: true,
        rows: Array.isArray(cachedResult) ? cachedResult : [],
        source: 'bq',
        diagnostics: {
          template_id: templateId,
          params,
          cacheHit: true
        }
      };
    }
    
    console.log(`Cache miss for ${templateId}, executing query`);
    
    // Get SQL template
    const sqlTemplate = readSqlTemplate(templateId);
    
    // Prepare SQL with parameters
    const sqlQuery = prepareSql(sqlTemplate, params);
    
    // Add query options with limits
    const startTime = Date.now();
    // Execute query with proper typing
    const [rows, metadata] = await (bigquery.query({ 
      query: sqlQuery,
      maximumBytesBilled: '1073741824', // 1 GB limit
      jobTimeoutMs: 15000 // 15 second timeout
    }) as Promise<[any[], any]>);
    const executionTime = Date.now() - startTime;
    
    // Get statistics if available
    const bytesProcessed = Number(metadata?.statistics?.totalBytesProcessed || 0);
    const jobId = String(metadata?.statistics?.jobId || '');
    
    // Store in cache (default TTL is 900 seconds / 15 minutes)
    await cache.set(cacheKey, JSON.stringify(rows), 900);
    
    return {
      success: true,
      rows,
      source: 'bq', // Explicitly mark this as BigQuery data
      diagnostics: {
        message: 'BigQuery executed successfully',
        template_id: templateId,
        params,
        query: sqlQuery,
        bytesProcessed,
        jobId,
        cacheHit: false,
        executionTime
      }
    };
  } catch (error) {
    console.error(`BigQuery execution error:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if the error message indicates a data availability issue
    const isDataRangeError = 
      errorMessage.includes('no data') || 
      errorMessage.includes('out of range') || 
      errorMessage.includes('not found');
    
    return {
      success: false,
      rows: [],
      source: 'bq',
      diagnostics: {
        message: isDataRangeError ? 
          `The requested data is not available. Available data ranges from ${DATA_AVAILABILITY.yearStart} to ${DATA_AVAILABILITY.yearEnd}.` : 
          'Failed to execute BigQuery query',
        error: errorMessage,
        template_id: templateId,
        params,
        allow_mock_fallback: false // Never fall back to mock data
      }
    };
  }
};

// Netlify function handler
const handler: Handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS request (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  try {
    // Parse request body
    const body: BigQueryRequest = JSON.parse(event.body || '{}');
    const { template_id, params = {} } = body;
    
    // Check if we're in BigQuery mode or forced mock mode
    const useMockData = dataMode !== 'bq' && dataMode !== 'live';
    
    if (!template_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          diagnostics: {
            message: 'Missing required parameter: template_id'
          }
        })
      };
    }
    
    // Set default year parameter if not provided
    if (!params.year) {
      // Default to current year - 1 to ensure complete data
      params.year = new Date().getFullYear() - 1;
    }

    // Validate that requested year is within available data range
    const requestedYear = Number(params.year);
    if (isNaN(requestedYear) || requestedYear < DATA_AVAILABILITY.yearStart || requestedYear > DATA_AVAILABILITY.yearEnd) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          source: 'bq',
          diagnostics: {
            message: `Data for year ${params.year} is not available. Available data ranges from ${DATA_AVAILABILITY.yearStart} to ${DATA_AVAILABILITY.yearEnd}.`,
            template_id,
            params
          }
        })
      };
    }

    // If period parameter is present, validate it's within available range
    if (params.period && params.period.toLowerCase().includes('month')) {
      const monthMatch = params.period.match(/(\d+)/);
      if (monthMatch) {
        const requestedMonth = parseInt(monthMatch[1], 10);
        const currentYear = new Date().getFullYear();
        
        // For current year, check month availability
        if (requestedYear === currentYear && requestedMonth > DATA_AVAILABILITY.monthEnd + 1) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              source: 'bq',
              diagnostics: {
                message: `Data for ${params.period} ${requestedYear} is not available yet. For ${requestedYear}, data is only available through month ${DATA_AVAILABILITY.monthEnd + 1}.`,
                template_id,
                params
              }
            })
          };
        }
      }
    }

    // Set default limit for customers query if not provided
    if (template_id === 'customers_top_n' && !params.limit) {
      params.limit = 5;
    }
    
    let result: BigQueryResponse;
    
    // If we're in mock mode, return error indicating mock data is not available
    // Executives should be informed that we don't have the data rather than seeing mock data
    if (useMockData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          source: 'bq', // We say 'bq' to indicate this is coming from the data source system
          diagnostics: {
            message: 'Mock data mode is deprecated. Please use live data or contact the data team to verify data availability.',
            template_id,
            params
          }
        })
      };
    } else {
      // Execute real BigQuery
      result = await executeBigQuery(template_id, params);
      
      // If BigQuery failed and returned no data, provide clear messaging
      if (!result.success || (result.rows && result.rows.length === 0)) {
        return {
          statusCode: 404, // Use 404 to indicate data not found
          headers,
          body: JSON.stringify({
            success: false,
            source: 'bq',
            diagnostics: {
              message: `No data available for this query. Please verify the requested parameters are valid and within available data ranges (${DATA_AVAILABILITY.yearStart}-${DATA_AVAILABILITY.yearEnd}).`,
              template_id,
              params,
              error: result.diagnostics?.error || 'No matching data found'
            }
          })
        };
      }
    }
    
    return {
      statusCode: result.success ? 200 : 500,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        diagnostics: {
          message: 'Server error',
          error: errorMessage
        }
      })
    };
  }
};

export { handler };
