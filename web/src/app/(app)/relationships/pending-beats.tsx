"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  confirmRelationshipBeat,
  dismissRelationshipBeat,
} from "./actions";

type Row = {
  id: string;
  beat_label: string | null;
  intensity: number | null;
  notes: string | null;
  scene_id: string | null;
};

export function PendingRelationshipBeats({ beats }: { beats: Row[] }) {
  const [, start] = useTransition();

  if (!beats.length) return null;

  return (
    <Card className="border-amber-300/40 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/15">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Suggested romance beats{" "}
          <Badge variant="secondary" className="ml-2 align-middle">
            approve or dismiss
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          The app proposed these from scene saves. Confirm to track them on your
          chemistry arc, or dismiss if they don&apos;t fit.
        </p>
        <ul className="space-y-3">
          {beats.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="text-sm">
                <span className="font-medium">{b.beat_label ?? "beat"}</span>
                {typeof b.intensity === "number" && (
                  <span className="text-muted-foreground">
                    {" "}
                    · intensity {b.intensity > 0 ? "+" : ""}
                    {b.intensity}
                  </span>
                )}
                {b.notes && (
                  <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {b.scene_id && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/scenes/${b.scene_id}`}>Scene</Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    start(async () => {
                      await confirmRelationshipBeat(b.id);
                    })
                  }
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    start(async () => {
                      await dismissRelationshipBeat(b.id);
                    })
                  }
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
