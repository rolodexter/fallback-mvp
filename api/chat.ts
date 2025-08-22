import type { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from 'dotenv';
import { callLLMProvider } from '../src/services/llmProvider';

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
  
  // Check if required environment variables are available
  if (!process.env.PERPLEXITY_API_KEY) {
    return response.status(500).json({ error: 'API key not configured' });
  }
  
  try {
    // Parse the request body
    const { message, history, grounding } = request.body as ChatRequest;
    
    if (!message) {
      return response.status(400).json({ error: 'Message is required' });
    }
    
    // Extract domain and BigQuery data from grounding if available
    const domain = grounding?.domain || null;
    const bigQueryData = grounding?.bigQueryData || null;
    
    // Get system prompt based on grounding type
    let systemPrompt;
    if (grounding?.groundingType === 'no_data') {
      systemPrompt = "You are Riskill AI, a maritime business intelligence assistant. " +
        "No data is currently available for this query. " +
        "Explain what information you would typically provide for this domain, " +
        "and suggest alternative queries the user could try.";
    }
    
    // Call the LLM provider with the message and BigQuery data
    const reply = await callLLMProvider(
      message, 
      systemPrompt, 
      history || [], 
      bigQueryData,
      domain
    );
    
    return response.status(200).json({
      reply,
      domain: domain
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    let errorMessage = 'Error processing your request';
    
    if (error instanceof Error) {
      console.error(error.message);
      // Don't expose sensitive error details to the client
      if (process.env.NODE_ENV === 'development') {
        errorMessage = `Development error: ${error.message}`;
      }
    }
    
    return response.status(500).json({
      error: errorMessage,
      reply: "I'm sorry, but I couldn't process your request at this moment. Please try again later."
    });
  }
}
