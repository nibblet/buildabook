"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ImportReview } from "@/lib/import/import-model";
import { commitImport, runImportExtraction } from "./actions";

type PlacementMode = "new_chapter" | "existing_chapter";

export function ImportClient() {
  const router = useRouter();
  const [draftText, setDraftText] = useState("");
  const [review, setReview] = useState<ImportReview | null>(null);
  const [selectedCharacterKeys, setSelectedCharacterKeys] = useState<string[]>([]);
  const [selectedWorldElementKeys, setSelectedWorldElementKeys] = useState<string[]>([]);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("new_chapter");
  const [existingChapterId, setExistingChapterId] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [createOpenThreads, setCreateOpenThreads] = useState(false);
  const [createStyleSample, setCreateStyleSample] = useState(false);
  const [error, setError] = useState("");
  const [extractPending, startExtract] = useTransition();
  const [commitPending, startCommit] = useTransition();

  const selectedCharacterSet = useMemo(
    () => new Set(selectedCharacterKeys),
    [selectedCharacterKeys],
  );
  const selectedWorldElementSet = useMemo(
    () => new Set(selectedWorldElementKeys),
    [selectedWorldElementKeys],
  );

  function runExtract() {
    setError("");
    startExtract(async () => {
      const result = await runImportExtraction(draftText);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReview(result.review);
      setSelectedCharacterKeys(
        result.review.characters
          .filter((character) => character.selected)
          .map((character) => character.key),
      );
      setSelectedWorldElementKeys(
        result.review.worldElements
          .filter((element) => element.selected)
          .map((element) => element.key),
      );
      setChapterTitle(result.review.chapterTitle);
      setExistingChapterId(result.review.chapters[0]?.id ?? "");
      setPlacementMode("new_chapter");
      setCreateOpenThreads(result.review.openThreads.length > 0);
      setCreateStyleSample(Boolean(result.review.styleSample?.content.trim()));
    });
  }

  function runCommit() {
    if (!review) return;
    setError("");
    startCommit(async () => {
      try {
        const result = await commitImport({
          review,
          placement:
            placementMode === "existing_chapter"
              ? { mode: "existing_chapter", chapterId: existingChapterId }
              : { mode: "new_chapter", title: chapterTitle },
          selectedCharacterKeys,
          selectedWorldElementKeys,
          createOpenThreads,
          createStyleSample,
        });
        router.push(`/chapters/${result.chapterId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      }
    });
  }

  function toggleKey(key: string, selected: boolean, setter: (keys: string[]) => void, keys: string[]) {
    setter(selected ? [...keys, key] : keys.filter((value) => value !== key));
  }

  const commitDisabled =
    commitPending ||
    !review ||
    (placementMode === "existing_chapter" && !existingChapterId) ||
    (placementMode === "new_chapter" && !chapterTitle.trim());

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Paste prose</CardTitle>
          <CardDescription>
            Import one scene or one chapter at a time for best extraction results.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder="Paste a full scene or chapter here..."
            className="min-h-[55vh] font-mono text-sm leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={runExtract}
              disabled={extractPending || !draftText.trim()}
              className="gap-2"
            >
              {extractPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {extractPending ? "Extracting..." : "Extract for review"}
            </Button>
            {review && (
              <span className="inline-flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                Review ready
              </span>
            )}
          </div>
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Placement</CardTitle>
            <CardDescription>Choose where the imported scenes should land.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="placement"
                checked={placementMode === "new_chapter"}
                onChange={() => setPlacementMode("new_chapter")}
                disabled={!review}
                className="mt-1"
              />
              <span className="space-y-2">
                <span className="block font-medium">Append as a new chapter</span>
                <Input
                  value={chapterTitle}
                  onChange={(event) => setChapterTitle(event.target.value)}
                  disabled={!review || placementMode !== "new_chapter"}
                  placeholder="Imported Chapter"
                />
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="placement"
                checked={placementMode === "existing_chapter"}
                onChange={() => setPlacementMode("existing_chapter")}
                disabled={!review || !review.chapters.length}
                className="mt-1"
              />
              <span className="block flex-1 space-y-2">
                <span className="block font-medium">Append to an existing chapter</span>
                <select
                  value={existingChapterId}
                  onChange={(event) => setExistingChapterId(event.target.value)}
                  disabled={!review || placementMode !== "existing_chapter"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {review?.chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title || `Chapter ${(chapter.order_index ?? 0) + 1}`}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </CardContent>
        </Card>

        {review ? (
          <>
            <ReviewSummary review={review} />
            <EntityReview
              title="Characters"
              emptyLabel="No characters extracted."
              rows={review.characters}
              selectedKeys={selectedCharacterSet}
              onToggle={(key, selected) =>
                toggleKey(
                  key,
                  selected,
                  setSelectedCharacterKeys,
                  selectedCharacterKeys,
                )
              }
            />
            <EntityReview
              title="World elements"
              emptyLabel="No world elements extracted."
              rows={review.worldElements}
              selectedKeys={selectedWorldElementSet}
              onToggle={(key, selected) =>
                toggleKey(
                  key,
                  selected,
                  setSelectedWorldElementKeys,
                  selectedWorldElementKeys,
                )
              }
            />

            <Card>
              <CardHeader>
                <CardTitle>Optional additions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createOpenThreads}
                    onChange={(event) => setCreateOpenThreads(event.target.checked)}
                    disabled={review.openThreads.length === 0}
                  />
                  Save {review.openThreads.length} open thread
                  {review.openThreads.length === 1 ? "" : "s"}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createStyleSample}
                    onChange={(event) => setCreateStyleSample(event.target.checked)}
                    disabled={!review.styleSample?.content.trim()}
                  />
                  Save extracted style sample
                </label>
                <Button
                  type="button"
                  onClick={runCommit}
                  disabled={commitDisabled}
                  className="w-full gap-2"
                >
                  {commitPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {commitPending ? "Importing..." : "Commit import"}
                </Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Extract pasted prose to review scenes, entities, and placement.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReviewSummary({ review }: { review: ImportReview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Extracted scenes</CardTitle>
        <CardDescription>
          {review.scenes.length} scene{review.scenes.length === 1 ? "" : "s"} will be
          appended in order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {review.scenes.map((scene) => (
          <div key={scene.key} className="rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{scene.title}</h3>
              <Badge variant="muted">{scene.wordcount} words</Badge>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
              {stripPreview(scene.content)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EntityReview({
  title,
  emptyLabel,
  rows,
  selectedKeys,
  onToggle,
}: {
  title: string;
  emptyLabel: string;
  rows: Array<{
    key: string;
    name: string;
    selected: boolean;
    match: { kind: "exact" | "alias" | "new"; existingName: string | null };
  }>;
  selectedKeys: Set<string>;
  onToggle: (key: string, selected: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Matched items link to existing canon; select new items to create.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          rows.map((row) => {
            const isNew = row.match.kind === "new";
            return (
              <label
                key={row.key}
                className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.has(row.key)}
                  onChange={(event) => onToggle(row.key, event.target.checked)}
                  disabled={!isNew}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{row.name}</span>
                  {isNew ? (
                    <span className="text-muted-foreground">Create as new</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Matched existing {row.match.kind}: {row.match.existingName}
                    </span>
                  )}
                </span>
                <Badge variant={isNew ? "secondary" : "success"}>
                  {isNew ? "New" : "Linked"}
                </Badge>
              </label>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function stripPreview(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
