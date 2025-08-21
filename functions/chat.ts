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

export const handler = async (event: any) => {
  // Handle preflight OPTIONS requests for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }
  
  // Ensure it's a POST request
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  // Check if the API key is available
  if (!PERPLEXITY_API_KEY) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }
  
  try {
    // Parse the request body
    const requestBody: ChatRequest = JSON.parse(event.body);
    const { message, domain } = requestBody;
    
    if (!message) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Message is required' })
      };
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
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify(perplexityRequest)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Perplexity API error: ${response.status} ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reply: data.choices[0].message.content,
        domain: domain || null
      })
    };
    
  } catch (error) {
    console.error('Error processing request:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Error processing your request' })
    };
  }
};
