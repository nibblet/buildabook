import { redirect } from "next/navigation";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { getOrCreateProject, isOnboarded } from "@/lib/projects";
import { tropeOptionsForWritingProfile } from "@/lib/seed/beats";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");
  const onboarded = await isOnboarded(project.id);
  if (onboarded) redirect("/");

  const writingProfile = parseWritingProfile(project.writing_profile);

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <OnboardingClient
        writingProfile={writingProfile}
        tropeOptions={tropeOptionsForWritingProfile(writingProfile)}
        defaultTargetWordcount={project.target_wordcount}
        defaultHeatLevel={project.heat_level ?? "steamy"}
      />
    </div>
  );
}
