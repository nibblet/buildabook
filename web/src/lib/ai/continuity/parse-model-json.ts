import { jsonrepair } from "jsonrepair";

/** Strip markdown code fences around JSON if present. */
export function stripCodeFence(text: string): string {
  let s = text.trim();
  const m = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/im.exec(s);
  if (m) return m[1].trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\r?\n?/i, "").replace(/\r?\n```\s*$/i, "");
  }
  return s.trim();
}

export function parseJsonObject(text: string): unknown {
  const stripped = stripCodeFence(text);
  const start = stripped.indexOf("{");
  if (start === -1) throw new Error("Extractor returned no JSON object");
  const candidate = stripped.slice(start);

  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      const endIdx = candidate.lastIndexOf("}");
      if (endIdx >= 1) {
        const slice = candidate.slice(0, endIdx + 1);
        try {
          return JSON.parse(jsonrepair(slice));
        } catch {
          /* fall through */
        }
      }
      throw new Error("Could not parse extraction JSON.");
    }
  }
}
