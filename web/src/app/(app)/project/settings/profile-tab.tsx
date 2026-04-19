"use client";

import type { FormEvent, ChangeEvent, ReactNode } from "react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Award,
  Clock,
  Flame,
  Lock,
  Save,
  Sparkles,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BADGES } from "@/lib/badges";
import type { Profile } from "@/lib/profiles";
import type { WriterStats } from "@/lib/writer-stats";
import { removeAvatar, saveProfile, uploadAvatar } from "./actions";

function initialsFrom(name: string | null, email: string | null): string {
  const base = (name || email || "").trim();
  if (!base) return "?";
  const parts = base.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function encouragement(stats: WriterStats): string {
  if (stats.currentStreakDays >= 3)
    return `Day ${stats.currentStreakDays} — the page is waiting.`;
  if (stats.sessionsThisWeek > 0)
    return `${stats.sessionsThisWeek} session${stats.sessionsThisWeek === 1 ? "" : "s"} this week — keep it going.`;
  if (stats.totalWords > 0)
    return "Your story is underway. The next sentence is the hard one.";
  return "A blank page is the start of everything.";
}

export function ProfileTab({
  profile,
  email,
  stats,
  earnedBadgeIds,
}: {
  profile: Profile;
  email: string | null;
  stats: WriterStats;
  earnedBadgeIds: string[];
}) {
  const router = useRouter();
  const earned = new Set(earnedBadgeIds);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<
    "idle" | "uploading" | "error"
  >("idle");
  const [avatarError, setAvatarError] = useState<string | null>(null);

  function onSave(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    start(async () => {
      try {
        await saveProfile({ displayName, bio });
        setStatus("saved");
        router.refresh();
      } catch {
        setStatus("error");
      }
    });
  }

  function onPickFile() {
    fileRef.current?.click();
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarStatus("uploading");
    setAvatarError(null);
    const fd = new FormData();
    fd.append("avatar", file);
    start(async () => {
      try {
        await uploadAvatar(fd);
        setAvatarStatus("idle");
        router.refresh();
      } catch (err) {
        setAvatarStatus("error");
        setAvatarError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function onRemoveAvatar() {
    start(async () => {
      await removeAvatar();
      router.refresh();
    });
  }

  const headline =
    displayName.trim() || profile.display_name || email || "Writer";
  const initials = initialsFrom(profile.display_name, email);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative">
              <div className="h-24 w-24 overflow-hidden rounded-full border bg-muted">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={headline}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-serif text-3xl text-muted-foreground">
                    {initials}
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />
              <div className="mt-2 flex justify-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onPickFile}
                  disabled={avatarStatus === "uploading"}
                  className="gap-1"
                >
                  <Upload className="h-3 w-3" />
                  {avatarStatus === "uploading" ? "Uploading…" : "Upload"}
                </Button>
                {profile.avatar_url && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onRemoveAvatar}
                    title="Remove avatar"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {avatarError && (
                <p className="mt-1 text-center text-[10px] text-destructive">
                  {avatarError}
                </p>
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Author profile
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight">
                {headline}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {encouragement(stats)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Words written"
          value={formatNumber(stats.totalWords)}
          sub={
            stats.targetWordcount
              ? `of ${formatNumber(stats.targetWordcount)} target`
              : undefined
          }
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Progress"
          value={`${stats.progressPct}%`}
          sub={`${stats.chaptersDone}/${stats.chaptersTotal || 0} chapters done`}
        />
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          label="Streak"
          value={`${stats.currentStreakDays} day${stats.currentStreakDays === 1 ? "" : "s"}`}
          sub={
            stats.longestStreakDays
              ? `Best: ${stats.longestStreakDays}`
              : "Write today to start"
          }
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="This week"
          value={`${stats.sessionsThisWeek}`}
          sub={`session${stats.sessionsThisWeek === 1 ? "" : "s"} logged`}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Badges</p>
            <span className="text-xs text-muted-foreground">
              {earned.size}/{BADGES.length} earned
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Locked badges stay hidden until you earn them.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BADGES.map((b) => {
              const isEarned = earned.has(b.id);
              return (
                <li
                  key={b.id}
                  className={
                    isEarned
                      ? "rounded-md border bg-background p-3"
                      : "rounded-md border border-dashed bg-muted/30 p-3"
                  }
                >
                  <div className="flex items-center gap-2">
                    {isEarned ? (
                      <Award className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <p className="text-sm font-medium">
                      {isEarned ? b.name : "Locked"}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isEarned ? b.description : b.hint}
                  </p>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <form onSubmit={onSave}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm font-medium">About you</p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Display name
              </Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you'd like to be addressed"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Bio</Label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="A short author bio (optional)"
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              {status === "saved" && (
                <span className="text-xs text-emerald-600">Saved.</span>
              )}
              {status === "error" && (
                <span className="text-xs text-destructive">Save failed.</span>
              )}
              <Button
                type="submit"
                className="gap-2"
                disabled={status === "saving"}
              >
                <Save className="h-4 w-4" />
                {status === "saving" ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-1 font-serif text-2xl font-semibold tracking-tight">
          {value}
        </p>
        {sub && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}
