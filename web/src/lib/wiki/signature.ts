import { createHash } from "node:crypto";

/** Stable SHA-256 over any JSON-serializable input (keys sorted recursively). */
export function computeSignature(input: unknown): string {
  const canonical = stableStringify(input);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Kebab-case slug used as `doc_key` for non-UUID-keyed docs (threads index etc). */
export function entitySlug(name: string | null | undefined): string {
  const raw = (name ?? "").trim().toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length ? cleaned : "untitled";
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
