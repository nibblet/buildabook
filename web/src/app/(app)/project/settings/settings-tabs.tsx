"use client";

import { BookOpen, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Profile } from "@/lib/profiles";
import type { Project, StyleSample } from "@/lib/supabase/types";
import type { WriterStats } from "@/lib/writer-stats";
import { ProfileTab } from "./profile-tab";
import { SettingsForm } from "./settings-form";

export function SettingsTabs({
  profile,
  email,
  stats,
  earnedBadgeIds,
  project,
  styleSamples,
}: {
  profile: Profile;
  email: string | null;
  stats: WriterStats;
  earnedBadgeIds: string[];
  project: Project;
  styleSamples: StyleSample[];
}) {
  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList>
        <TabsTrigger value="profile" className="gap-1.5">
          <User className="h-3.5 w-3.5" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="story" className="gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Story settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        <ProfileTab
          profile={profile}
          email={email}
          stats={stats}
          earnedBadgeIds={earnedBadgeIds}
        />
      </TabsContent>
      <TabsContent value="story">
        <SettingsForm project={project} styleSamples={styleSamples} />
      </TabsContent>
    </Tabs>
  );
}
