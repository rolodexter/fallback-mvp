import type { VercelRequest, VercelResponse } from '@vercel/node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

type ChatRequest = {
  message: string;
  domain?: string;
};

type PerplexityRequest = {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
};

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

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
  
  // Check if the API key is available
  if (!PERPLEXITY_API_KEY) {
    return response.status(500).json({ error: 'API key not configured' });
  }
  
  try {
    // Parse the request body
    const { message, domain } = request.body as ChatRequest;
    
    if (!message) {
      return response.status(400).json({ error: 'Message is required' });
    }
    
    // Determine the system prompt template based on domain (if provided)
    let systemPrompt = 'You are a helpful financial data assistant.';
    
    if (domain) {
      // This will be enhanced in Stage 3 with proper template injection
      // For now, just use a basic domain-specific prompt
      switch (domain.toLowerCase()) {
        case 'performance':
          systemPrompt = 'You are a financial performance analyst focused on business unit metrics.';
          break;
        case 'counterparties':
          systemPrompt = 'You are a counterparty risk specialist who analyzes relationships with business partners.';
          break;
        case 'risk':
          systemPrompt = 'You are a risk assessment expert who provides insights on financial trends and risks.';
          break;
      }
    }
    
    // Prepare the request to Perplexity API
    const perplexityRequest: PerplexityRequest = {
      model: 'sonar', // Using the sonar model as specified
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 500
    };
    
    // Make the API call to Perplexity
    const perplexityResponse = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify(perplexityRequest)
    });
    
    if (!perplexityResponse.ok) {
      const errorData = await perplexityResponse.json();
      throw new Error(`Perplexity API error: ${perplexityResponse.status} ${JSON.stringify(errorData)}`);
    }
    
    const data = await perplexityResponse.json();
    
    return response.status(200).json({
      reply: data.choices[0].message.content,
      domain: domain || null
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    return response.status(500).json({ error: 'Error processing your request' });
  }
}
