import Link from "next/link";
import { format } from "date-fns";
import { BookMarked } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SpineData } from "@/lib/spine";
import type { WritingSession } from "@/lib/supabase/types";
import { formatNumber } from "@/lib/utils";
import { WrapSessionForm } from "./wrap-session-form";

function sceneLabel(spine: SpineData, sceneId: string): string {
  const scene = spine.scenes.find((s) => s.id === sceneId);
  if (!scene) return "Scene";
  const chapter = spine.chapters.find((c) => c.id === scene.chapter_id);
  const ch =
    chapter?.title?.trim() ||
    `Chapter ${(chapter?.order_index ?? 0) + 1}`;
  const sc =
    scene.title?.trim() ||
    `Scene ${(scene.order_index ?? 0) + 1}`;
  return `${ch} — ${sc}`;
}

export function SessionContinuitySection({
  spine,
  lastSession,
}: {
  spine: SpineData;
  lastSession: WritingSession | null;
}) {
  const sinceMs = lastSession?.ended_at
    ? new Date(lastSession.ended_at).getTime()
    : null;

  const touchedSince =
    sinceMs === null
      ? []
      : spine.scenes
          .filter((s) => new Date(s.updated_at).getTime() > sinceMs)
          .sort(
            (a, b) =>
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime(),
          )
          .slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookMarked className="h-4 w-4" /> Story continuity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Last session
          </h3>
          {lastSession ? (
            <>
              <p className="text-xs text-muted-foreground">
                {format(new Date(lastSession.ended_at), "MMM d, yyyy · h:mm a")}
              </p>
              {lastSession.summary && (
                <p className="text-sm leading-relaxed">{lastSession.summary}</p>
              )}
              {lastSession.writer_note && (
                <p className="border-l-2 border-primary/30 pl-3 text-sm italic text-muted-foreground">
                  <span className="font-medium not-italic text-foreground">
                    Note to self:{" "}
                  </span>
                  {lastSession.writer_note}
                </p>
              )}
              {lastSession.last_scene_id && (
                <p className="text-xs text-muted-foreground">
                  Focus scene:{" "}
                  <Link
                    href={`/scenes/${lastSession.last_scene_id}`}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {sceneLabel(spine, lastSession.last_scene_id)}
                  </Link>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              When you finish a writing block, wrap the session below — we save a
              short recap (and your own note) so you can pick up the thread next
              time.
            </p>
          )}
        </div>

        {sinceMs !== null && touchedSince.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Updated since that wrap
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {touchedSince.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/scenes/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {sceneLabel(spine, s.id)}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatNumber(s.wordcount ?? 0)} words
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Wrap this session
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Saves a two-sentence recap (when AI is configured) plus anything you
            want to remember next time.
          </p>
          <WrapSessionForm />
        </div>
      </CardContent>
    </Card>
  );
}
