import { env } from "@/lib/env";

/** voyage-3 → 1024 dims — matches `scene_chunks.embedding vector(1024)`. */
export async function voyageEmbed(inputs: string[]): Promise<number[][] | null> {
  const key = env.voyageApiKey();
  if (!key || inputs.length === 0) return null;

  const model = env.voyageEmbeddingModel();
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: inputs,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Voyage embed failed:", res.status, err);
    return null;
  }

  const json = (await res.json()) as {
    data?: { embedding: number[] }[];
  };
  const rows = json.data;
  if (!rows?.length) return null;
  return rows.map((d) => d.embedding);
}
