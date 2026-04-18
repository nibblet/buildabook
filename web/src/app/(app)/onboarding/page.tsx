import { redirect } from "next/navigation";
import { getOrCreateProject, isOnboarded } from "@/lib/projects";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");
  const onboarded = await isOnboarded(project.id);
  if (onboarded) redirect("/");

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <OnboardingClient />
    </div>
  );
}
