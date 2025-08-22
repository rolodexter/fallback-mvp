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
 * @returns The LLM response text
 */
export async function callLLMProvider(
  prompt: string, 
  systemPrompt?: string,
  history: Array<ChatMessage> = []
) {
  const provider = process.env.PROVIDER || "perplexity";
  switch (provider) {
    case "perplexity":
      return await callPerplexity(prompt, systemPrompt, history);
    // Later we can add Anthropic, OpenRouter, etc.
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Call Perplexity API with a prompt
 * @param prompt The text prompt to send to Perplexity
 * @param systemPrompt Optional system prompt to override default
 * @param history Optional array of previous conversation messages
 * @returns The response text from Perplexity
 */
async function callPerplexity(
  prompt: string, 
  systemPrompt?: string,
  history: Array<{role: "user" | "assistant", content: string}> = []
) {
  // Build messages array with system prompt and history
  const messages = [
    { 
      role: "system", 
      content: systemPrompt || "You are Riskill AI, an executive assistant for maritime analytics."
    }
  ];
  
  // Add conversation history if provided (limited to last few turns)
  const limitedHistory = history.slice(-6); // Limit to last 6 messages
  messages.push(...limitedHistory);
  
  // Add the current user message
  messages.push({ role: "user", content: prompt });
  
  // Use PERPLEXITY_API_KEY or PPLX_API_KEY environment variable
  const apiKey = process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Perplexity API key. Set PERPLEXITY_API_KEY or PPLX_API_KEY environment variable.");
  }
  
  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "sonar-small-chat",   // default model
      messages: messages
    })
  });
  
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Provider error (${resp.status}): ${resp.statusText} - ${errorText}`);
  }
  
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "No response.";
}
