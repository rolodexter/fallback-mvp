import type { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from 'dotenv';
import { callLLMProvider } from '../src/services/llmProvider';

// Load environment variables
dotenv.config();

type ChatRequest = {
  message: string;
  domain?: string;
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
    const { message, domain } = request.body as ChatRequest;
    
    if (!message) {
      return response.status(400).json({ error: 'Message is required' });
    }
    
    // Add domain context to the prompt if provided
    const contextualPrompt = domain 
      ? `[Context: ${domain}] ${message}` 
      : message;
    
    // Call the LLM provider with the message
    const reply = await callLLMProvider(contextualPrompt);
    
    return response.status(200).json({
      reply,
      domain: domain || null
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    return response.status(500).json({ error: 'Error processing your request' });
  }
}
