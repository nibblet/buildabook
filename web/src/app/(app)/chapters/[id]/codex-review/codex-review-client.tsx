"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acceptHighConfidenceClaimsChapterAction,
  confirmClaimIdsAction,
  rejectAllAutoClaimsChapterAction,
  rejectClaimIdsAction,
  resolveClaimsToCharacterAction,
  resolveClaimsToRelationshipAction,
  resolveClaimsToWorldElementAction,
} from "@/app/(app)/chapters/[id]/codex-actions";
import type { ContinuityClaim } from "@/lib/supabase/types";

type SceneMin = { id: string; title: string | null; order_index: number | null };
type DestinationOption = {
  id: string;
  name: string | null;
  aliases?: string[] | null;
  category?: string | null;
};
type RelationshipOption = {
  id: string;
  type: string | null;
  current_state: string | null;
  char_a_id: string | null;
  char_b_id: string | null;
};

export function CodexReviewClient({
  chapterId,
  chapterTitle,
  claims,
  scenes,
  characters,
  worlds,
  relationships,
}: {
  chapterId: string;
  chapterTitle: string | null;
  claims: ContinuityClaim[];
  scenes: SceneMin[];
  characters: DestinationOption[];
  worlds: DestinationOption[];
  relationships: RelationshipOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confidenceFilter, setConfidenceFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [targetCharacterId, setTargetCharacterId] = useState("");
  const [targetWorldId, setTargetWorldId] = useState("");
  const [targetRelationshipId, setTargetRelationshipId] = useState("");
  const [aliasText, setAliasText] = useState("");
  const [worldCategory, setWorldCategory] = useState("");

  const sceneById = useMemo(() => {
    const m = new Map<string, SceneMin>();
    for (const s of scenes) m.set(s.id, s);
    return m;
  }, [scenes]);

  const visibleClaims = useMemo(
    () =>
      claims.filter((c) =>
        confidenceFilter === "all" ? true : c.confidence === confidenceFilter,
      ),
    [claims, confidenceFilter],
  );

  const characterById = useMemo(() => {
    const m = new Map<string, DestinationOption>();
    for (const character of characters) m.set(character.id, character);
    return m;
  }, [characters]);

  const worldById = useMemo(() => {
    const m = new Map<string, DestinationOption>();
    for (const world of worlds) m.set(world.id, world);
    return m;
  }, [worlds]);

  const grouped = useMemo(() => {
    const m = new Map<string, ContinuityClaim[]>();
    for (const c of visibleClaims) {
      const key = c.subject_label.trim() || "-";
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleClaims]);

  function selectClaims(nextClaims: ContinuityClaim[]) {
    setSelectedIds(new Set(nextClaims.map((c) => c.id)));
  }

  function toggleClaim(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confidenceVariant(confidence: ContinuityClaim["confidence"]) {
    if (confidence === "high") return "success";
    if (confidence === "medium") return "warn";
    return "muted";
  }

  function relationshipLabel(relationship: RelationshipOption) {
    const left = relationship.char_a_id
      ? characterById.get(relationship.char_a_id)?.name
      : null;
    const right = relationship.char_b_id
      ? characterById.get(relationship.char_b_id)?.name
      : null;
    const pair = left && right ? `${left} / ${right}` : "Relationship";
    const type = relationship.type ? ` (${relationship.type})` : "";
    return `${pair}${type}`;
  }

  function destinationText(claim: ContinuityClaim) {
    if (claim.subject_character_id) {
      return `Character: ${
        characterById.get(claim.subject_character_id)?.name ?? "Unknown"
      }`;
    }
    if (claim.subject_world_element_id) {
      const world = worldById.get(claim.subject_world_element_id);
      const category = world?.category ? ` (${world.category})` : "";
      return `World: ${world?.name ?? "Unknown"}${category}`;
    }
    if (claim.subject_relationship_id) {
      const relationship = relationships.find(
        (r) => r.id === claim.subject_relationship_id,
      );
      return `Relationship: ${
        relationship ? relationshipLabel(relationship) : "Unknown"
      }`;
    }
    if (claim.resolution_note) return claim.resolution_note;
    if (claim.proposed_destination_type) {
      return `Unresolved ${claim.proposed_destination_type.replace("_", " ")}`;
    }
    return "Unresolved";
  }

  function acceptHigh() {
    setMsg(null);
    start(async () => {
      const res = await acceptHighConfidenceClaimsChapterAction(chapterId);
      if (res.ok) {
        setMsg(`Promoted ${res.count ?? 0} high-confidence fact(s) to your bible.`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  function confirmSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setMsg(null);
    start(async () => {
      const res = await confirmClaimIdsAction(chapterId, ids);
      if (res.ok) {
        setSelectedIds(new Set());
        setMsg(`Promoted ${res.count ?? 0} selected fact(s).`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  function rejectSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Reject ${ids.length} selected claim(s)?`)) return;
    setMsg(null);
    start(async () => {
      const res = await rejectClaimIdsAction(chapterId, ids);
      if (res.ok) {
        setSelectedIds(new Set());
        setMsg(`Rejected ${res.count ?? 0} selected claim(s).`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  function rejectAll() {
    if (!window.confirm("Reject all unconfirmed claims in this chapter? This cannot be undone.")) {
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await rejectAllAutoClaimsChapterAction(chapterId);
      if (res.ok) {
        setMsg(`Rejected ${res.count ?? 0} claim(s).`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  function resolveSelectedToCharacter() {
    const ids = [...selectedIds];
    if (!targetCharacterId || !ids.length) return;
    setMsg(null);
    start(async () => {
      const res = await resolveClaimsToCharacterAction({
        chapterId,
        claimIds: ids,
        characterId: targetCharacterId,
        alias: aliasText.trim() || null,
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setAliasText("");
        setMsg(`Resolved ${res.count ?? 0} claim(s) to character.`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  function resolveSelectedToWorld() {
    const ids = [...selectedIds];
    if (!targetWorldId || !ids.length) return;
    setMsg(null);
    start(async () => {
      const res = await resolveClaimsToWorldElementAction({
        chapterId,
        claimIds: ids,
        worldElementId: targetWorldId,
        alias: aliasText.trim() || null,
        category: worldCategory.trim() || null,
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setAliasText("");
        setWorldCategory("");
        setMsg(`Resolved ${res.count ?? 0} claim(s) to world entry.`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  function resolveSelectedToRelationship() {
    const ids = [...selectedIds];
    if (!targetRelationshipId || !ids.length) return;
    setMsg(null);
    start(async () => {
      const res = await resolveClaimsToRelationshipAction({
        chapterId,
        claimIds: ids,
        relationshipId: targetRelationshipId,
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setMsg(`Resolved ${res.count ?? 0} claim(s) to relationship.`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/chapters/${chapterId}`}>← Back to chapter</Link>
        </Button>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Codex review
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {chapterTitle ?? "Untitled chapter"} — {claims.length} unconfirmed fact
          {claims.length === 1 ? "" : "s"} extracted from scene prose.
        </p>
      </div>

      {msg ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{msg}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-3">
        <Button
          type="button"
          size="sm"
          variant={confidenceFilter === "all" ? "default" : "outline"}
          onClick={() => setConfidenceFilter("all")}
        >
          All
        </Button>
        <Button
          type="button"
          size="sm"
          variant={confidenceFilter === "high" ? "default" : "outline"}
          onClick={() => setConfidenceFilter("high")}
        >
          High
        </Button>
        <Button
          type="button"
          size="sm"
          variant={confidenceFilter === "medium" ? "default" : "outline"}
          onClick={() => setConfidenceFilter("medium")}
        >
          Medium
        </Button>
        <Button
          type="button"
          size="sm"
          variant={confidenceFilter === "low" ? "default" : "outline"}
          onClick={() => setConfidenceFilter("low")}
        >
          Low
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => selectClaims(claims.filter((c) => c.confidence === "high"))}
        >
          Select high
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => selectClaims(claims.filter((c) => c.confidence !== "low"))}
        >
          Select medium + high
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setSelectedIds(new Set())}
        >
          Deselect
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={confirmSelected}
          disabled={pending || !selectedIds.size}
        >
          Confirm selected ({selectedIds.size})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={rejectSelected}
          disabled={pending || !selectedIds.size}
        >
          Reject selected
        </Button>
        <Button type="button" size="sm" onClick={acceptHigh}>
          Accept all high-confidence
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={rejectAll}>
          Reject all (chapter)
        </Button>
      </div>

      <div className="rounded-md border bg-card p-3">
        <p className="mb-2 text-sm font-medium">Resolve selected claims</p>
        <div className="grid gap-2 md:grid-cols-2">
          <select
            value={targetCharacterId}
            onChange={(e) => setTargetCharacterId(e.target.value)}
            className="rounded-md border bg-background px-2 py-2 text-sm"
          >
            <option value="">Choose character...</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            onClick={resolveSelectedToCharacter}
            disabled={pending || !selectedIds.size || !targetCharacterId}
          >
            Merge into character
          </Button>

          <select
            value={targetWorldId}
            onChange={(e) => setTargetWorldId(e.target.value)}
            className="rounded-md border bg-background px-2 py-2 text-sm"
          >
            <option value="">Choose world entry...</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name ?? "Unnamed world entry"}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            onClick={resolveSelectedToWorld}
            disabled={pending || !selectedIds.size || !targetWorldId}
          >
            Merge into world
          </Button>

          <select
            value={targetRelationshipId}
            onChange={(e) => setTargetRelationshipId(e.target.value)}
            className="rounded-md border bg-background px-2 py-2 text-sm"
          >
            <option value="">Choose relationship...</option>
            {relationships.map((r) => (
              <option key={r.id} value={r.id}>
                {relationshipLabel(r)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            onClick={resolveSelectedToRelationship}
            disabled={pending || !selectedIds.size || !targetRelationshipId}
          >
            Merge into relationship
          </Button>
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input
            value={aliasText}
            onChange={(e) => setAliasText(e.target.value)}
            placeholder="Optional alias to add, e.g. Ava"
            className="rounded-md border bg-background px-2 py-2 text-sm"
          />
          <input
            value={worldCategory}
            onChange={(e) => setWorldCategory(e.target.value)}
            placeholder="Optional world category, e.g. organization"
            className="rounded-md border bg-background px-2 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-8">
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing pending. Write more scenes - facts appear here after each save.
          </p>
        ) : (
          grouped.map(([subject, rows]) => (
            <section key={subject}>
              <h2 className="mb-3 text-sm font-semibold">{subject}</h2>
              <ul className="space-y-2 text-sm">
                {rows.map((c) => {
                  const sc = sceneById.get(c.source_scene_id);
                  return (
                    <li key={c.id}>
                      <label className="flex gap-3 rounded-md border bg-card px-3 py-2 leading-relaxed">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleClaim(c.id)}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge variant={confidenceVariant(c.confidence)}>
                              {c.confidence}
                            </Badge>
                            <Badge variant="outline">{c.kind}</Badge>
                            <Badge variant="outline">{destinationText(c)}</Badge>
                          </span>
                          <span className="mt-2 block">
                            <span className="font-mono text-xs text-muted-foreground">
                              {c.predicate}
                            </span>{" "}
                            → {c.object_text}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            scene {(sc?.order_index ?? 0) + 1}
                            {sc?.title ? ` · ${sc.title}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
