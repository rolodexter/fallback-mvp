// ESM module. No external deps; works with your existing llmProvider.
export type RewriteOut = { canonical: string; confidence: number; rationale?: string };

// Extract tokens we must preserve (keeps router deterministic)
function extractTokens(msg: string) {
  const unit = (msg.match(/\bZ\d{3}\b/i) || [])[0]?.toUpperCase() || null;
  const year = (msg.match(/\b(20\d{2})\b/) || [])[1] || null;
  const month = (msg.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  ) || [])[1] || null;
  return { unit, year, month };
}

// Deterministic fallback when LLM is off/unavailable
function heuristicRewrite(message: string): RewriteOut | null {
  const { unit, year, month } = extractTokens(message);

  const wantsTrend =
    /(trend|trajectory|run[- ]?rate|last\s+(3|6|12)\s+months|m\/m|mom)/i.test(message);
  const wantsTopN =
    /(top|largest|biggest)\s+(customers?|counterpart(y|ies))|concentration/i.test(message);
  const wantsList = /(list|show|display)\s+(business\s*)?units\b|\bunits\b/i.test(message);
  const wantsSnapshot = /\bsnapshot|overview|bu\b/i.test(message) || !!unit;

  if (wantsTopN) return { canonical: "Top counterparties YTD", confidence: 0.65 };
  if (wantsTrend) return { canonical: "Monthly gross trend", confidence: 0.65 };
  if (wantsList) return { canonical: "List business units", confidence: 0.6 };
  if (wantsSnapshot && unit) {
    // Preserve tokens
    if (month) return { canonical: `${unit} ${month} snapshot`, confidence: 0.6 };
    if (year)  return { canonical: `${unit} ${year}`, confidence: 0.6 };
    return { canonical: `${unit} snapshot`, confidence: 0.55 };
  }
  return null;
}

async function callLLM(message: string): Promise<RewriteOut | null> {
  try {
    const llm: any = await import("./llmProvider.js");
    const timeoutMs = Number(process.env.LLM_REWRITE_TIMEOUT_MS ?? 1500);
    const system = [
      "You convert executive free-form asks into ONE canonical prompt the router understands.",
      "Allowed canonicals (exact strings):",
      "- Monthly gross trend",
      "- Top counterparties YTD",
      "- List business units",
      "- <UNIT> <MONTH> snapshot   (e.g., 'Z001 June snapshot')",
      "- <UNIT> <YEAR>             (e.g., 'Z001 2024')",
      "If UNIT/MONTH/YEAR appear, KEEP them in the canonical.",
      "Respond ONLY with strict JSON: {\"canonical\":\"...\",\"confidence\":0..1}"
    ].join("\n");

    const user = `Message: "${message}"`;
    // The provider interface can vary; try common shapes
    const resp =
      (await llm.chatJSON?.({ system, user, timeoutMs, temperature: 0 })) ||
      (await llm.chat?.([{ role: "system", content: system }, { role: "user", content: user }], { timeoutMs, temperature: 0 })) ||
      (await llm.complete?.(system + "\n\n" + user, { timeoutMs, temperature: 0 })) ||
      // Fallback to the project's callLLMProvider if available
      (await llm.callLLMProvider?.(user, system, [], null, null));

    const text: string =
      typeof resp === "string"
        ? resp
        : resp?.text ?? resp?.content ?? resp?.choices?.[0]?.message?.content ?? "";

    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;

    const parsed = JSON.parse(m[0]);
    if (typeof parsed?.canonical !== "string") return null;

    // Protect against the model dropping tokens:
    const { unit, year, month } = extractTokens(message);
    if (unit && !parsed.canonical.toUpperCase().includes(unit))
      parsed.canonical = `${unit} ${parsed.canonical}`.trim();
    if (month && !new RegExp(month, "i").test(parsed.canonical) && !year)
      parsed.canonical = `${parsed.canonical} ${month}`.trim();

    return { canonical: parsed.canonical.trim(), confidence: Number(parsed.confidence ?? 0) };
  } catch {
    return null;
  }
}

export async function rewriteMessage(message: string): Promise<RewriteOut | null> {
  // Only rewrite when enabled
  if (process.env.NARRATIVE_MODE !== "llm") return null;

  // Try LLM first (fast + low temperature + short timeout)
  const llm = await callLLM(message);
  if (llm) return llm;

  // Fallback heuristics so we still help without the model
  return heuristicRewrite(message);
}
