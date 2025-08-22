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
 * @returns The LLM response text
 */
export async function callLLMProvider(
  prompt: string, 
  systemPrompt?: string,
  history: Array<ChatMessage> = [],
  bigQueryData?: any[] | null,
  domain?: string | null
) {
  const provider = process.env.PROVIDER || "perplexity";
  switch (provider) {
    case "perplexity":
      return await callPerplexity(prompt, systemPrompt, history, bigQueryData, domain);
    // Later we can add Anthropic, OpenRouter, etc.
    default:
      throw new Error(`Unsupported provider: ${provider}`);
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
async function callPerplexity(
  prompt: string, 
  systemPrompt?: string,
  history: Array<{role: "user" | "assistant", content: string}> = [],
  bigQueryData?: any[] | null,
  domain?: string | null
) {
  // Define the standard Riskill AI system prompt for grounded responses
  const defaultSystemPrompt = "You are Riskill AI, a maritime business intelligence assistant.\n" +
    "Always ground your responses in the structured data provided below.\n" +
    "Never invent values not present in the rows.\n" +
    "Explain results clearly in executive business language, focusing on insights, risks, and opportunities.\n" +
    "If rows are empty or incomplete, acknowledge limitations and provide contextual framing only.";

  // Build messages array with system prompt
  const messages: Message[] = [
    { 
      role: "system", 
      content: systemPrompt || defaultSystemPrompt
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
    throw new Error("Missing Perplexity API key. Set PERPLEXITY_API_KEY or PPLX_API_KEY environment variable.");
  }
  
  // Configure the request to Perplexity
  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "sonar", // Using the sonar model as specified
      messages: messages,
      temperature: 0.2,  // Lower temperature for more factual responses
      max_tokens: 500    // Limit response length as specified
    })
  });
  
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Provider error (${resp.status}): ${resp.statusText} - ${errorText}`);
  }
  
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "No response.";
}
