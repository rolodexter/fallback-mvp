import { Handler } from '@netlify/functions';
import { callLLMProvider } from '../../src/services/llmProvider';
import { GroundingPayload } from '../../src/services/chatClient';

type ChatRequest = {
  message: string;
  history: Array<{role: "user" | "assistant", content: string}>;
  grounding: GroundingPayload;
};

/**
 * Netlify serverless function for chat API
 * Handles grounded chat message requests and forwards them to the LLM provider
 */
const handler: Handler = async (event) => {
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
    const { message, history, grounding } = body;
    
    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }

    // Build context block from grounding information
    let contextBlock = '';
    
    // Only add context if we have high enough confidence
    if (grounding && grounding.domain && grounding.confidence >= 0.3) {
      contextBlock = `=== CONTEXT BLOCK (DO NOT DISCLOSE) ===\n`;
      
      // Add domain and confidence
      contextBlock += `Domain: ${grounding.domain}\n`;
      contextBlock += `Confidence: ${grounding.confidence.toFixed(2)}\n`;
      
      // Add KPI summary if available
      if (grounding.kpiSummary) {
        contextBlock += `\nKPI Summary: ${grounding.kpiSummary}\n`;
      }
      
      // Add template output if available
      if (grounding.templateOutput) {
        contextBlock += `\nData:${grounding.templateOutput}\n`;
      }
      
      contextBlock += `=== END CONTEXT BLOCK ===\n\n`;
    }
    
    // Build system prompt with instructions on how to use context
    const systemPrompt = `You are Riskill, a helpful finance AI assistant. ${grounding && grounding.domain && grounding.confidence >= 0.3 ? 
      "Use ONLY the data in the CONTEXT BLOCK for your response. If the context doesn't contain relevant data, ask for clarification instead of making up information." : 
      "Answer questions helpfully, and ask for clarification if you need more information."}`.trim();
    
    // Call the LLM provider with the message and context block
    const userPrompt = `${contextBlock}${message}`;
    const response = await callLLMProvider(userPrompt, systemPrompt, history);
    
    // Return the response with metadata
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ 
        text: response, 
        meta: {
          domain: grounding?.domain || null,
          confidence: grounding?.confidence || 0,
          groundingType: grounding?.groundingType || null
        }
      })
    };
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Return error response
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

export { handler };
