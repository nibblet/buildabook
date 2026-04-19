export type ContinuityDial = "quiet" | "helpful" | "vigilant";

/** Filter which annotation tiers show for the current sensitivity dial. */
export function annotationVisibleForDial(
  tier: "A" | "B" | "C",
  dial: ContinuityDial,
): boolean {
  if (tier === "A") return true;
  if (tier === "B") {
    if (dial === "quiet") return false;
    return true;
  }
  return dial === "vigilant";
}
