import { supabaseServer } from "@/lib/supabase/server";
import type { WikiDocType, WikiDocument } from "@/lib/supabase/types";

export type CompiledDoc = {
  title: string;
  bodyMd: string;
  sourceSignature: string;
  sourceRefs: Record<string, unknown>;
};

export async function getCurrentDoc(
  projectId: string,
  docType: WikiDocType,
  docKey: string,
): Promise<WikiDocument | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("wiki_documents")
    .select("*")
    .eq("project_id", projectId)
    .eq("doc_type", docType)
    .eq("doc_key", docKey)
    .eq("status", "current")
    .maybeSingle();
  return (data as WikiDocument) ?? null;
}

export async function listCurrentDocs(
  projectId: string,
  docType?: WikiDocType,
): Promise<WikiDocument[]> {
  const supabase = await supabaseServer();
  let q = supabase
    .from("wiki_documents")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "current");
  if (docType) q = q.eq("doc_type", docType);
  const { data } = await q.order("doc_type").order("doc_key");
  return (data ?? []) as WikiDocument[];
}

export type UpsertResult = { action: "skipped" | "inserted"; id: string };

/** Atomically demote old `current` and insert a fresh `current` when the signature changed. */
export async function upsertDoc(
  projectId: string,
  docType: WikiDocType,
  docKey: string,
  doc: CompiledDoc,
  model: string | null,
): Promise<UpsertResult> {
  const supabase = await supabaseServer();
  const existing = await getCurrentDoc(projectId, docType, docKey);

  if (existing && existing.source_signature === doc.sourceSignature) {
    return { action: "skipped", id: existing.id };
  }

  if (existing) {
    const { error: demoteErr } = await supabase
      .from("wiki_documents")
      .update({ status: "superseded" })
      .eq("id", existing.id);
    if (demoteErr) throw demoteErr;
  }

  const nextVersion = (existing?.version ?? 0) + 1;
  const { data, error } = await supabase
    .from("wiki_documents")
    .insert({
      project_id: projectId,
      doc_type: docType,
      doc_key: docKey,
      version: nextVersion,
      status: "current",
      title: doc.title,
      body_md: doc.bodyMd,
      source_signature: doc.sourceSignature,
      source_refs: doc.sourceRefs,
      model,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { action: "inserted", id: data.id };
}
