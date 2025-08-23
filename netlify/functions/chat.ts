import { Handler } from '@netlify/functions';
import dotenv from 'dotenv';
import { callLLMProvider } from '../../src/services/llmProvider';
import { GroundingPayload } from '../../src/services/chatClient';
import { routeMessage } from '../../src/data/router/router';
import { runTemplate } from '../../src/data/templates';

// Supported data modes
type DataMode = 'mock' | 'live';

// Load environment variables
dotenv.config();

type ChatRequest = {
  message: string;
  history: Array<{role: "user" | "assistant", content: string}>;
  grounding?: GroundingPayload;
  router?: {
    domain: string;
    confidence: number;
    [key: string]: any;
  };
  template?: string;
};

/**
 * Netlify serverless function for chat API
 * Handles grounded chat message requests and forwards them to the LLM provider
 */
const handler: Handler = async (event) => {
  console.log('Netlify function called:', event.httpMethod, event.path);
  
  // Check which data mode we're in (mock or live)
  const dataMode: DataMode = (process.env.DATA_MODE === 'mock' ? 'mock' : 'live');
  console.log(`[Netlify] Using data mode: ${dataMode}`);
  
  // Check for required environment variables
  const requiredEnvVars = ['PROVIDER', 'PERPLEXITY_API_KEY'];
  if (dataMode === 'live') {
    requiredEnvVars.push('GOOGLE_APPLICATION_CREDENTIALS');
  }
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    console.error(`[ERROR] Missing required environment variables: ${missingVars.join(', ')}`);
    return {
      statusCode: 503,
      body: JSON.stringify({ 
        mode: 'nodata',
        reason: 'missing_env',
        text: 'Service unavailable due to missing environment configuration.',
        details: `Missing environment variables: ${missingVars.join(', ')}` 
      })
    };
  }

  // Validate provider value
  const provider = process.env.PROVIDER;
  if (provider !== 'perplexity') {
    console.error(`[ERROR] Unsupported provider: ${provider}`);
    return {
      statusCode: 503,
      body: JSON.stringify({ 
        mode: 'nodata',
        reason: 'invalid_provider',
        text: 'Service unavailable due to provider configuration issues.',
        details: `Unsupported provider: ${provider}`
      })
    };
  }

  // Only allow POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    const body = JSON.parse(event.body || '{}') as ChatRequest;
    const { message, history, grounding, router, template } = body;
    
    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          mode: 'nodata', 
          reason: 'missing_message',
          text: 'Invalid request. Message is required.'
        })
      };
    }
    
    // Use incoming router context if provided, otherwise perform routing on the server
    let routeResult = router || routeMessage(message);
    let domainTemplate = template || (routeResult.domain !== 'none' ? routeResult.domain : undefined);
    
    // Safety check - if router returns 'none' domain, return nodata response immediately
    if (routeResult.domain === 'none' || routeResult.confidence < 0.3) {
      console.info('[Netlify] No domain detected or low confidence, returning nodata response');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
          mode: 'nodata',
          reason: 'no_domain',
          text: 'Try asking about Business Units (YoY), Top Counterparties, or Monthly Gross Trend.',
          meta: {
            domain: null,
            confidence: routeResult.confidence || 0,
            groundingType: null
          }
        })
      };
    }

    // Generate grounding data if not provided in request
    let groundingData = grounding;
    
    if (!groundingData && domainTemplate && routeResult.confidence >= 0.3) {
      try {
        console.info(`[Netlify] Generating grounding data for domain: ${domainTemplate}`);
        const templateData = await runTemplate(domainTemplate, null);
        
        groundingData = {
          domain: domainTemplate,
          confidence: routeResult.confidence,
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput || null,
          groundingType: 'template'
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we're in mock mode or don't have BigQuery data yet, try template
    if ((dataMode === 'mock' || dataMode === 'live') && !groundingData && domainTemplate && routeResult.confidence >= 0.3) {
      try {
        console.info(`[Netlify] Generating grounding data for domain: ${domainTemplate}`);
        const templateData = await runTemplate(domainTemplate, null);
        
        groundingData = {
          domain: domainTemplate,
          confidence: routeResult.confidence,
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput || null,
          groundingType: 'drilldown',
          bigQueryData: null
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we still don't have grounding data, return abstain response
    if (!groundingData) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          mode: 'abstain',
          text: 'I don\'t have the data you\'re looking for right now.',
          abstain_reason: 'no_grounding_data',
          meta: {
            domain: domainTemplate,
            confidence: routeResult.confidence,
            groundingType: 'none'
          },
          provenance: {
            source: dataMode,
            template_id: domainTemplate
          }
        })
      };
    }
    
    // Extract domain and template information from grounding
    const domain = groundingData.domain;
    const bigQueryData = groundingData.bigQueryData || null;
    const templateOutput = groundingData.templateOutput || null;
    const kpiSummary = groundingData.kpiSummary || null;
    const groundingType = groundingData.groundingType;
    
    console.log(`Using domain: ${domain}, Grounding type: ${groundingType}`);
    
    let systemPrompt = '';
    let responseText = '';
    let widgets = null;
    
    // For template/mock data mode, we can use the template output directly
    if (templateOutput) {
      // In mock mode or when using templates directly, we can use the template output directly
      if (dataMode === 'mock') {
        responseText = templateOutput;
        
        // Optionally polish the narrative if needed
        if (process.env.POLISH_NARRATIVE === 'true') {
          try {
            const polishingPrompt = `Rewrite this text for clarity. Do not change numbers, KPIs, or fields. Here's the text:\n\n${templateOutput}`;
            const polishedText = await callLLMProvider(polishingPrompt, 'You are an editor helping to improve text clarity while preserving all facts and figures exactly as provided.', []);
            
            if (polishedText) {
              responseText = polishedText;
              console.log('Narrative polished successfully');
            }
          } catch (err) {
            console.warn('Failed to polish narrative, using template text directly:', err);
            // Fall back to template output
            responseText = templateOutput;
          }
        }
      } else {
        // In live mode, use the template output to guide the LLM
        systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data and text provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.\n
KPI SUMMARY:\n${kpiSummary || 'No KPI summary available.'}\n
TEMPLATE OUTPUT:\n${templateOutput}`;
        
        // Call LLM provider
        responseText = await callLLMProvider(message, systemPrompt, history || []);
      }
    } else if (bigQueryData) {
      // Format BigQuery results
      const resultsText = JSON.stringify(bigQueryData, null, 2);
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.\n
BIGQUERY DATA:\n${resultsText}`;
      
      // Call LLM provider
      responseText = await callLLMProvider(message, systemPrompt, history || []);
    } else {
      // Generic prompt when no grounding
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer questions about financial KPIs and business metrics. If you don't know the answer, say "I don't have that information available." DO NOT make up data.`;
      
      // Call LLM provider
      responseText = await callLLMProvider(message, systemPrompt, history || []);
    }
    
    // Extract widgets from template data if available
    if (groundingData && groundingData.kpiSummary) {
      try {
        const kpiData = JSON.parse(groundingData.kpiSummary);
        if (kpiData && typeof kpiData === 'object') {
          widgets = kpiData;
        }
      } catch (e) {
        console.warn('Failed to parse KPI data as JSON:', e);
      }
    }
    
    // Prepare response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        text: responseText,
        mode: 'strict',  // Default to strict mode for mock/template data
        widgets: widgets,
        meta: {
          domain,
          confidence: routeResult.confidence,
          groundingType
        },
        provenance: {
          template_id: domainTemplate,
          source: dataMode
        }
      })
    };
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Return structured error response with nodata mode
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        mode: 'nodata',
        reason: 'server_error',
        text: 'Service unavailable. Please try again later.',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

export { handler };
