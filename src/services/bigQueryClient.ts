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
  };
}

/**
 * Get the base URL for API calls based on deployment platform
 */
function getBaseUrl(): string {
  // If window is defined, we're in the browser
  if (typeof window !== 'undefined') {
    // Check for platform-specific environment variable
    const platform = import.meta.env.VITE_DEPLOY_PLATFORM;
    
    // Use window location as base
    const origin = window.location.origin;
    
    // If explicitly set to netlify
    if (platform === 'netlify') {
      return `${origin}/.netlify/functions`;
    }
    
    // Otherwise default to Vercel-style API routes
    return `${origin}/api`;
  }
  
  // Fallback for SSR (though this client is primarily for browser use)
  return '/api';
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
    
    // Return error response
    return {
      success: false,
      rows: [],
      diagnostics: {
        message: 'Failed to execute BigQuery',
        error: error instanceof Error ? error.message : String(error),
        template_id: templateId,
        params,
      },
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
      return 'business_units_snapshot_yoy_v1';
    case 'counterparties':
      return 'customers_top_n';
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
