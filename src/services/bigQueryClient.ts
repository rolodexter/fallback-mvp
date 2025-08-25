/**
 * Client for interacting with BigQuery serverless function
 */

export interface BigQueryRequest {
  template_id: string;
  params?: Record<string, any>;
}

export interface BigQueryResponse {
  success: boolean;
  rows?: any[];
  diagnostics?: {
    message?: string;
    error?: string;
    template_id?: string;
    params?: Record<string, any>;
    query?: string;
    ms?: number;
    jobId?: string;
    dataset?: string;
    location?: string;
  };
}

/**
 * Get the base URL for API calls based on deployment platform
 */
function getBaseUrl(): string {
  // If window is defined, we're in the browser
  if (typeof window !== 'undefined') {
    const platform = import.meta.env.VITE_DEPLOY_PLATFORM;
    const origin = window.location.origin;
    if (platform === 'netlify') return `${origin}/.netlify/functions`;
    return `${origin}/api`;
  }

  // Server-side (Node) requires an absolute URL
  const vercelUrl = process.env.VERCEL_URL; // e.g. my-app.vercel.app
  if (vercelUrl) return `https://${vercelUrl}/api`;

  // Netlify provides URL/DEPLOY_URL
  const netlifyUrl = process.env.URL || process.env.DEPLOY_URL; // e.g. https://site.netlify.app
  if (netlifyUrl) return `${netlifyUrl.replace(/\/$/, '')}/.netlify/functions`;

  // Local dev fallback
  const port = process.env.PORT || '3000';
  return `http://127.0.0.1:${port}/api`;
}

/**
 * Execute a BigQuery template and return the results
 * @param templateId The SQL template ID to execute
 * @param params Optional parameters for the query
 * @returns Promise resolving to BigQueryResponse
 */
export async function executeBigQuery(
  templateId: string,
  params: Record<string, any> = {}
): Promise<BigQueryResponse> {
  try {
    // Get the base URL for API calls
    const baseUrl = getBaseUrl();
    
    // Make the API call
    const response = await fetch(`${baseUrl}/bigquery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: templateId,
        params,
      }),
    });
    
    // Check if response is OK
    if (!response.ok) {
      throw new Error(`BigQuery request failed with status ${response.status}`);
    }
    
    // Parse the response
    const result = await response.json();
    
    // Add debug information if available
    if (typeof window !== 'undefined' && window.__riskillDebug) {
      // Extend the debug object with BigQuery properties if needed
      (window.__riskillDebug as any).bigQueryTemplateId = templateId;
      (window.__riskillDebug as any).bigQueryParams = params;
      (window.__riskillDebug as any).bigQuerySuccess = result.success;
      (window.__riskillDebug as any).bigQueryRows = result.rows?.length || 0;
    }
    
    return result;
  } catch (error) {
    console.error('BigQuery client error:', error);
    
    // Build diagnostics and persist for provenance
    const diagnostics = {
      message: 'Failed to execute BigQuery',
      error: error instanceof Error ? error.message : String(error),
      template_id: templateId,
      params,
    } as BigQueryResponse['diagnostics'];

    // Return error response
    return {
      success: false,
      rows: [],
      diagnostics,
    };
  }
}

/**
 * Map template domain to BigQuery SQL template ID
 * @param domain Domain from router
 * @returns SQL template ID
 */
export function mapDomainToTemplateId(domain: string): string {
  switch (domain) {
    case 'performance':
      return 'monthly_gross_trend_v1';
    case 'counterparties':
      return 'top_counterparties_gross_v1';
    case 'risk':
      return 'risks_summary';
    case 'profitability':
      return 'profitability_by_business_unit_v1';
    case 'regional':
      return 'regional_revenue_trend_24m_v1';
    default:
      throw new Error(`Unsupported domain: ${domain}`);
  }
}
