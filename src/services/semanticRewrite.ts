// ESM module. No external deps; works with your existing llmProvider.
import { BU_ALIASES } from "../data/router/bu_aliases.js";
export type RewriteOut = { canonical: string; confidence: number; rationale?: string };

// Extract tokens we must preserve (keeps router deterministic)
function norm(s: string) {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function resolveAliasToUnit(message: string): string | null {
  const m = norm(message);
  for (const [k, code] of Object.entries(BU_ALIASES)) {
    const key = norm(k);
    const r = new RegExp(`(^|\\s)${key}(\\s|$)`);
    if (r.test(m)) return code.toUpperCase();
  }
  return null;
}

function extractTokens(msg: string) {
  const aliasUnit = resolveAliasToUnit(msg);
  const unit = aliasUnit ?? (msg.match(/\bZ\d{3}\b/i) || [])[0]?.toUpperCase() || null;
  const year = (msg.match(/\b(20\d{2})\b/) || [])[1] || null;
  const month = (msg.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/i) || [])[0] || null;
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

  // BU name/case like "tell me about our liferafts business"
  if (unit && /(business|bu|unit|division|line)/i.test(message)) {
    if (month) return { canonical: `${unit} ${month} snapshot`, confidence: 0.72 };
    if (year)  return { canonical: `${unit} ${year}`,           confidence: 0.72 };
    return       { canonical: `${unit} snapshot`,               confidence: 0.70 };
  }

  if (wantsTopN) return { canonical: "Top counterparties YTD", confidence: 0.65 };
  if (wantsTrend) return { canonical: "Monthly gross trend", confidence: 0.65 };
  if (wantsList) return { canonical: "List business units", confidence: 0.6 };
  if (wantsSnapshot && unit) {
    // Preserve tokens
    if (month) return { canonical: `${unit} ${month} snapshot`, confidence: 0.6 };
    if (year)  return { canonical: `${unit} ${year}`, confidence: 0.6 };
    return { canonical: `${unit} snapshot`, confidence: 0.55 };
  }
  if (unit) {
    if (month) return { canonical: `${unit} ${month} snapshot`, confidence: 0.65 };
    if (year)  return { canonical: `${unit} ${year}`,           confidence: 0.65 };
    return       { canonical: `${unit} snapshot`,               confidence: 0.60 };
  }
  return null;
}

async function callLLM(message: string): Promise<RewriteOut | null> {
  // Small helper: tolerant JSON extraction
  const parseJsonLoose = (txt: string): any | null => {
    if (!txt) return null;
    try { return JSON.parse(txt); } catch {}
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  };

  try {
    // Don't assume default export; support named-only modules
    const mod: any = await import("./llmProvider.js");
    const llm: any = mod?.default ?? mod;

    const timeoutMs = Number(process.env.LLM_REWRITE_TIMEOUT_MS ?? 1500);

    const system = [
      "Convert an executive ask into ONE canonical prompt the router understands.",
      "Allowed canonicals (exact strings):",
      "- Monthly gross trend",
      "- Top counterparties YTD",
      "- List business units",
      "- <UNIT> <MONTH> snapshot (e.g., 'Z001 June snapshot')",
      "- <UNIT> <YEAR> (e.g., 'Z001 2024')",
      "KEEP any UNIT/MONTH/YEAR tokens from the user.",
      "Respond ONLY as JSON: {\"canonical\":\"...\",\"confidence\":0..1}"
    ].join("\n");

    const user = `Message: "${message}"`;

    // Try providers in order of “most structured” → “least structured”
    let text: string | undefined;

    // 1) chatJSON(system,user)
    if (!text && typeof llm?.chatJSON === "function") {
      const r = await llm.chatJSON({ system, user, temperature: 0, timeoutMs });
      text = r?.text ?? r?.content ?? r;
    }

    // 2) chat([{role,...}], opts)
    if (!text && typeof llm?.chat === "function") {
      const r = await llm.chat(
        [{ role: "system", content: system }, { role: "user", content: user }],
        { temperature: 0, timeoutMs }
      );
      text = r?.text ?? r?.content ?? r?.choices?.[0]?.message?.content ?? r;
    }

    // 3) complete(prompt)
    if (!text && typeof llm?.complete === "function") {
      const r = await llm.complete(system + "\n\n" + user, { temperature: 0, timeoutMs });
      text = r?.text ?? r?.content ?? r;
    }

    // 4) callLLMProvider (support object or positional signature)
    if (!text && typeof llm?.callLLMProvider === "function") {
      try {
        // Object signature
        const rObj = await llm.callLLMProvider({
          system,
          prompt: `${system}\n\n${user}\nRespond ONLY with strict JSON.`,
          temperature: 0,
          maxTokens: 120,
          timeoutMs
        });
        text = rObj?.text ?? rObj?.content ?? rObj?.output ?? rObj;
      } catch {}

      if (!text) {
        try {
          // Positional signature: (prompt, systemPrompt?, history?, bigQueryData?, domain?)
          const rPos = await llm.callLLMProvider(user, system, [], null, null);
          text = rPos?.text ?? rPos?.content ?? rPos;
        } catch {}
      }
    }

    // 5) Other common shims
    if (!text && typeof llm?.invoke === "function") {
      const r = await llm.invoke({ system, user, temperature: 0, timeoutMs });
      text = r?.text ?? r?.content ?? r;
    }
    if (!text && typeof llm?.generate === "function") {
      const r = await llm.generate(system + "\n\n" + user, { temperature: 0, timeoutMs });
      text = r?.text ?? r?.content ?? r;
    }

    if (!text) return null;

    const parsed = parseJsonLoose(String(text));
    if (!parsed || typeof parsed?.canonical !== "string") return null;

    // Ensure tokens weren’t lost and alias codes are injected when needed
    const { unit: unitFromMsg, year, month } = extractTokens(message);
    let canonical = parsed.canonical.trim();
    const unitFromCanonical = (canonical.match(/\bZ\d{3}\b/i) || [])[0]?.toUpperCase() || null;
    const unitFinal = unitFromCanonical ?? unitFromMsg;

    if (unitFinal && !canonical.toUpperCase().includes(unitFinal)) {
      canonical = `${unitFinal} ${canonical}`.trim();
    }
    if (month && !new RegExp(month, "i").test(canonical) && !year) {
      canonical = `${canonical} ${month}`.trim();
    }

    return { canonical, confidence: Number(parsed.confidence ?? 0) };
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
