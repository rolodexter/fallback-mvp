import type { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from 'dotenv';
import { callLLMProvider } from '../src/services/llmProvider';
import { routeMessage } from '../src/data/router/router';
import { runTemplate } from '../src/data/templates';

// Supported data modes
type DataMode = 'mock' | 'live';

// Load environment variables
dotenv.config();

type ChatRequest = {
  message: string;
  history?: Array<{role: "user" | "assistant", content: string}>;
  grounding?: {
    domain: string | null;
    confidence: number;
    groundingType: "intro" | "drilldown" | "no_data" | null;
    kpiSummary?: string | null;
    templateOutput?: string | null;
    bigQueryData?: any[] | null;
  };
  router?: {
    domain: string;
    confidence: number;
    [key: string]: any;
  };
  template?: string;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  
  // Ensure it's a POST request
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }
  
  // Check which data mode we're in (mock or live)
  const dataMode: DataMode = (process.env.DATA_MODE === 'mock' ? 'mock' : 'live');
  console.log(`[Vercel] Using data mode: ${dataMode}`);
  
  // Check for required environment variables
  const requiredEnvVars = ['PROVIDER', 'PERPLEXITY_API_KEY'];
  if (dataMode === 'live') {
    requiredEnvVars.push('GOOGLE_APPLICATION_CREDENTIALS');
  }
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    console.error(`[ERROR] Missing required environment variables: ${missingVars.join(', ')}`);
    return response.status(503).json({ 
      mode: 'nodata',
      reason: 'missing_env',
      text: 'Service unavailable due to missing environment configuration.',
      details: `Missing environment variables: ${missingVars.join(', ')}` 
    });
  }

  // Validate provider value
  const provider = process.env.PROVIDER;
  if (provider !== 'perplexity') {
    console.error(`[ERROR] Unsupported provider: ${provider}`);
    return response.status(503).json({ 
      mode: 'nodata',
      reason: 'invalid_provider',
      text: 'Service unavailable due to provider configuration issues.',
      details: `Unsupported provider: ${provider}`
    });
  }
  
  try {
    // Parse the request body
    const { message, history, grounding, router, template } = request.body as ChatRequest;
    
    if (!message) {
      return response.status(400).json({ 
        mode: 'nodata', 
        reason: 'missing_message',
        text: 'Invalid request. Message is required.'
      });
    }
    
    // Use incoming router context if provided, otherwise perform routing on the server
    let routeResult = router || routeMessage(message);
    let domainTemplate = template || (routeResult.domain !== 'none' ? routeResult.domain : undefined);
    
    // Safety check - if router returns 'none' domain, return nodata response immediately
    if (routeResult.domain === 'none' || routeResult.confidence < 0.3) {
      console.info('[Vercel] No domain detected or low confidence, returning nodata response');
      return response.status(200).json({
        mode: 'nodata',
        reason: 'no_domain',
        text: 'Try asking about Business Units (YoY), Top Counterparties, or Monthly Gross Trend.',
        meta: {
          domain: null,
          confidence: routeResult.confidence || 0,
          groundingType: null
        }
      });
    }
    
    // Generate grounding data if not provided in request
    let groundingData = grounding;
    
    if (!groundingData && domainTemplate && routeResult.confidence >= 0.3) {
      try {
        console.info(`[Vercel] Generating grounding data for domain: ${domainTemplate}`);
        const templateData = await runTemplate(domainTemplate, null);
        
        groundingData = {
          domain: domainTemplate,
          confidence: routeResult.confidence,
          kpiSummary: templateData.kpiSummary || null,
          templateOutput: templateData.templateOutput || null,
          groundingType: 'drilldown',  // Using supported type from the enum
          bigQueryData: null
        };
      } catch (err) {
        console.error(`[ERROR] Failed to generate grounding data:`, err);
        // Continue without grounding if generation fails
      }
    }
    
    // If we're in live mode and don't have BigQuery data yet, try template
    if (dataMode === 'live' && !groundingData && domainTemplate && routeResult.confidence >= 0.3) {
      try {
        console.info(`[Vercel] Generating grounding data for domain: ${domainTemplate}`);
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
      return response.status(200).json({
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
      });
    }
    
    // Extract domain and BigQuery data from grounding
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
            const polishedText = await callLLMProvider(polishingPrompt, 'You are an editor helping to improve text clarity while preserving all facts and figures exactly as provided.', [], null, null);
            
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
        systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data and text provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.

KPI SUMMARY:\n${kpiSummary || 'No KPI summary available.'}

TEMPLATE OUTPUT:\n${templateOutput}`;
        
        // Call LLM provider
        responseText = await callLLMProvider(message, systemPrompt, history, null, domain);
      }
    } else if (bigQueryData) {
      // Format BigQuery results
      const resultsText = JSON.stringify(bigQueryData, null, 2);
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer the question using ONLY the data provided below. If you cannot answer the question with the provided data, say "I don't have that information available." DO NOT make up any data or statistics that are not provided.

BIGQUERY DATA:\n${resultsText}`;
      
      // Call LLM provider
      responseText = await callLLMProvider(message, systemPrompt, [], bigQueryData, domain);
    } else {
      // Generic prompt when no grounding
      systemPrompt = `You are Riskill, a financial data analysis assistant. Answer questions about financial KPIs and business metrics. If you don't know the answer, say "I don't have that information available." DO NOT make up data.`;
      
      // Call LLM provider
      responseText = await callLLMProvider(message, systemPrompt, [], null, null);
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
    return response.status(200).json({
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
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    // Error message for logging only
    const logErrorMessage = 'Error processing your request';
    
    if (error instanceof Error) {
      console.error(error.message);
      // Don't expose sensitive error details to the client
      if (process.env.NODE_ENV === 'development') {
        // Log development error
      console.error(`Development error: ${error.message}`);
      }
    }
    
    return response.status(500).json({
      mode: 'nodata',
      reason: 'server_error',
      text: 'Service unavailable. Please try again later.',
      details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
