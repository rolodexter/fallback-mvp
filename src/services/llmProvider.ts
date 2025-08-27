/**
 * LLM Provider Abstraction
 * Provides a unified interface for different LLM providers
 */

/**
 * Message types for LLM providers
 */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SystemMessage = {
  role: "system";
  content: string;
};

export type Message = SystemMessage | ChatMessage;

/**
 * Call the configured LLM provider with a prompt
 * @param prompt The text prompt to send to the LLM
 * @param systemPrompt Optional system prompt to override default
 * @param history Optional array of previous conversation messages
 * @param bigQueryData Optional BigQuery data for grounding
 * @param domain Optional domain context
 * @param stage The LLM processing stage (skeleton, reasoning, or polish)
 * @returns The LLM response text
 */
export type LLMStage = 'skeleton' | 'reasoning' | 'polish'; // Three-stage process: skeleton, reasoning draft, then polish

export async function callLLMProvider(
  prompt: string, 
  systemPrompt?: string,
  history: Array<ChatMessage> = [],
  bigQueryData?: any[] | null,
  domain?: string | null,
  stage: LLMStage = 'reasoning' // Default to reasoning stage for draft generation
) {
  console.info('[LLMProvider] Starting LLM request', {
    domain,
    hasHistory: history.length > 0,
    historyLength: history.length,
    hasSystemPrompt: !!systemPrompt,
    hasBigQueryData: !!(bigQueryData && bigQueryData.length > 0),
    promptLength: prompt.length,
    stage: stage // Log which stage we're currently in
  });

  const provider = process.env.LLM_PROVIDER || "perplexity";
  console.info(`[LLMProvider] Using provider: ${provider}`);

  try {
    switch (provider) {
      case "perplexity":
        return await callPerplexity(prompt, systemPrompt, history, bigQueryData, domain, stage);
      // Later we can add Anthropic, OpenRouter, etc.
      default:
        console.error(`[LLMProvider] Unsupported provider: ${provider}`);
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error(`[LLMProvider] Error calling provider ${provider}:`, error);
    throw error;
  }
}

/**
 * Call Perplexity API with a prompt and BigQuery data as grounding
 * @param prompt The text prompt to send to Perplexity
 * @param systemPrompt Optional system prompt to override default
 * @param history Optional array of previous conversation messages
 * @param bigQueryData Optional BigQuery data for grounding
 * @param domain Optional domain context
 * @returns The response text from Perplexity
 */
/**
 * Parse Perplexity sonar-reasoning response to strip <think></think> sections
 * @param response Raw response from Perplexity
 * @returns Cleaned response without thinking sections
 */
/**
 * Parse Perplexity sonar-reasoning response to strip <think></think> sections
 * @param response Raw response from Perplexity
 * @returns Cleaned response without thinking sections
 */
function stripThinkingSections(response: string): string {
  // Remove <think>...</think> sections which appear in sonar-reasoning models
  return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Get specialized system prompt for the current LLM stage
 * @param stage The current LLM processing stage
 * @param baseSystemPrompt Optional base system prompt to customize
 * @returns Stage-specific system prompt
 */
function getStageSystemPrompt(stage: LLMStage, baseSystemPrompt?: string): string {
  // Base system prompt for all stages
  const defaultBasePrompt = "You are Riskill AI, a sophisticated maritime business intelligence assistant designed specifically for IDP executives.\n" +
    "You communicate with the nuance and depth expected in executive-level maritime business discourse.\n" +
    "EXTREMELY IMPORTANT: Always ground your responses in the structured data provided below.\n" +
    "Never invent values not present in the data rows, even if it seems a natural extrapolation.\n" +
    "Deliver insights with executive precision - concise yet comprehensive, authoritative yet approachable.\n" +
    "When analyzing business units, consider broader maritime industry context, market position, competitive dynamics, and long-term strategic implications.\n" +
    "Transform data into strategic narratives that contextualize numbers within the executive's decision-making framework.\n" +
    "Highlight material changes, emergent patterns, anomalies, and strategic inflection points in the data.\n" +
    "If data is unavailable or limited, acknowledge these constraints transparently while providing valuable contextual framing.\n" +
    "When discussing business units, reference their formal designations but use their common names in your narrative for natural communication.\n" +
    "Maintain the tone of a trusted strategic advisor who understands both data precision and executive priorities.";
  
  // Use provided base prompt or default
  const basePrompt = baseSystemPrompt || defaultBasePrompt;
  
  // Add stage-specific instructions
  switch (stage) {
    case 'skeleton':
      // For the skeleton stage, we want to generate a structured outline with placeholders
      return `${basePrompt}\n\n` +
        "STAGE INSTRUCTION: SKELETON GENERATION\n" +
        "Generate a structured narrative outline with clearly marked placeholders for precise business metrics.\n" +
        "Create placeholder markers using double curly braces format: {{PLACEHOLDER_NAME}}\n" +
        "For example: Revenue grew by {{GROWTH_RATE}}% to {{CURRENT_REVENUE}}M EUR\n" +
        "Include placeholders for all key metrics that should be filled with precise values from data.\n" +
        "Structure the response as a complete narrative with introduction, key insights sections, and conclusion.\n" +
        "Focus on creating a logical flow that an executive would find valuable, with clear placeholders for data points.";
      
    case 'reasoning':
      // For the reasoning stage, we want deeper analysis based on data patterns
      return `${basePrompt}\n\n` +
        "STAGE INSTRUCTION: REASONING AND ANALYSIS\n" +
        "Carefully analyze the data provided and identify the most significant patterns, trends, and anomalies.\n" +
        "Connect individual data points into a coherent strategic narrative focused on business implications.\n" +
        "Identify cause-effect relationships and second-order implications of the metrics shown.\n" +
        "You may use <think>...</think> sections to show your reasoning process - these will be removed before presenting to executives.\n" +
        "Be sure to maintain absolute factual accuracy while deriving meaningful insights from the data patterns.";
      
    case 'polish':
      // For the polish stage, we focus on refining language and presentation
      return `${basePrompt}\n\n` +
        "STAGE INSTRUCTION: EXECUTIVE POLISH\n" +
        "Refine and elevate the provided draft into an executive-grade communication.\n" +
        "Ensure tone is authoritative yet approachable, precise yet natural.\n" +
        "Optimize language for clarity, impact, and strategic framing.\n" +
        "Maintain absolute factual accuracy while improving narrative flow and strategic contextualization.\n" +
        "Format response for easy scanning by busy executives with appropriate paragraph breaks and structural elements.";
      
    default:
      // Default case, use base prompt
      return basePrompt;
  }
}

async function callPerplexity(
  prompt: string, 
  systemPrompt?: string,
  history: Array<{role: "user" | "assistant", content: string}> = [],
  bigQueryData?: any[] | null,
  domain?: string | null,
  stage: LLMStage = 'reasoning' // Default to reasoning stage
) {
  console.info('[Perplexity] Preparing request', { domain, hasSystemPrompt: !!systemPrompt, stage });
  
  // Get the stage-specific system prompt using our specialized function
  const stageSystemPrompt = getStageSystemPrompt(stage, systemPrompt);
  console.info(`[Perplexity] Using ${stage} stage system prompt`);


  // Build messages array with system prompt
  const messages: Message[] = [
    { 
      role: "system", 
      content: stageSystemPrompt
    }
  ];
  
  // Add conversation history if provided (limited to last few turns)
  const limitedHistory = history.slice(-6); // Limit to last 6 messages
  messages.push(...limitedHistory);
  
  // Format the user query with domain context if available
  const userQuery = domain 
    ? `User query: ${prompt} (Domain: ${domain})`
    : `User query: ${prompt}`;
  
  // Add the user message
  messages.push({ role: "user", content: userQuery });
  
  // Add BigQuery data as an assistant message if available
  if (bigQueryData && bigQueryData.length > 0) {
    const dataJson = JSON.stringify(bigQueryData, null, 2);
    messages.push({
      role: "assistant",
      content: `DATA ROWS:\n${dataJson}`
    });
  } else if (domain) {
    // If no data but we have a domain, add a message indicating no data
    messages.push({
      role: "assistant",
      content: `DATA ROWS: No data available for domain '${domain}'.`
    });
  }
  
  // Use PERPLEXITY_API_KEY or PPLX_API_KEY environment variable
  const apiKey = process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY;
  if (!apiKey) {
    console.error('[Perplexity] Missing API key');
    throw new Error("Missing Perplexity API key. Set PERPLEXITY_API_KEY or PPLX_API_KEY environment variable.");
  }
  
  console.info('[Perplexity] API key validated');
  
  // Log request information with sensitive information redacted
  console.info('[Perplexity] Request configuration:', { 
    messageCount: messages.length,
    stage: stage
  });
  
  // Configure the request to Perplexity with optimal parameters based on stage
  console.time('[Perplexity] API request time');
  
  // Configure optimal parameters for each stage
  const stageConfig = {
    skeleton: {
      model: 'sonar',            // Lighter model is sufficient for skeleton
      temperature: 0.1,          // Low temperature for consistent, predictable skeleton
      max_tokens: 500,           // Shorter output for skeleton
      top_p: 0.8                 // More deterministic
    },
    reasoning: {
      model: 'sonar-reasoning',  // Reasoning model for deeper analysis
      temperature: 0.3,          // Higher temperature for more creative analysis
      max_tokens: 900,           // Longer output for reasoning stage
      top_p: 0.9                 // Allow more diversity in analysis
    },
    polish: {
      model: 'sonar',            // Standard model for polished output
      temperature: 0.2,          // Balanced temperature for polish stage
      max_tokens: 600,           // Medium length for final output
      top_p: 0.85                // Balanced determinism and creativity
    }
  };
  
  // Use the config for the current stage, with fallback to reasoning stage
  const config = stageConfig[stage] || stageConfig.reasoning;
  console.info(`[Perplexity] Stage ${stage} config:`, config);
  
  let resp;
  try {
    resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        top_p: config.top_p,
        disable_search: true      // CRITICAL: keeps outputs strictly on provided facts
      })
    });
    console.timeEnd('[Perplexity] API request time');
    
    console.info('[Perplexity] Response status:', { status: resp.status, statusText: resp.statusText });
    
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('[Perplexity] API error:', { status: resp.status, statusText: resp.statusText, error: errorText });
      throw new Error(`Provider error (${resp.status}): ${resp.statusText} - ${errorText}`);
    }
  } catch (error) {
    console.timeEnd('[Perplexity] API request time');
    console.error('[Perplexity] Network or API error:', error);
    throw error;
  }
  
  try {
    const data = await resp.json();
    let response = data.choices?.[0]?.message?.content || "No response.";
    
    // For reasoning models, strip out the thinking sections
    if (stage === 'reasoning' && config.model.includes('reasoning')) {
      response = stripThinkingSections(response);
    }
    
    console.info('[Perplexity] Response received', { 
      responseLength: response.length,
      hasResponse: response !== "No response.",
      modelUsed: config.model,
      stage: stage
    });
    
    return response;
  } catch (error) {
    console.error('[Perplexity] Error parsing response:', error);
    throw new Error(`Failed to parse provider response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
