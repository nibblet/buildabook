/** Canonical role/species vocabulary — shared by import extraction and character editor. */

export type PresetOption = { value: string; label: string };

export const CHARACTER_ROLE_PRESETS: readonly PresetOption[] = [
  { value: "protagonist", label: "Protagonist" },
  { value: "love_interest", label: "Love interest" },
  { value: "antagonist", label: "Antagonist" },
  { value: "supporting", label: "Supporting" },
  { value: "animal_companion", label: "Animal companion" },
  { value: "backstory", label: "Backstory-only" },
] as const;

export const CHARACTER_SPECIES_PRESETS: readonly PresetOption[] = [
  { value: "human", label: "Human" },
  { value: "shifter", label: "Shifter" },
  { value: "vampire", label: "Vampire" },
  { value: "witch", label: "Witch" },
  { value: "fae", label: "Fae" },
  { value: "psychic", label: "Psychic" },
  { value: "unknown", label: "Unknown" },
] as const;

const rolePresetSet = new Set(
  CHARACTER_ROLE_PRESETS.map((p) => p.value),
);
const speciesPresetSet = new Set(
  CHARACTER_SPECIES_PRESETS.map((p) => p.value),
);

export function isRolePreset(value: string | null | undefined): boolean {
  return value != null && value !== "" && rolePresetSet.has(value);
}

export function isSpeciesPreset(value: string | null | undefined): boolean {
  return value != null && value !== "" && speciesPresetSet.has(value);
}

/** Sentinel `value` for the native `<select>` “Other / custom” option (never stored in DB). */
export const PRESET_CUSTOM_SENTINEL = "__custom__";

export function promptRoleAlternatives(): string {
  return CHARACTER_ROLE_PRESETS.map((p) => p.value).join(" | ");
}

export function promptSpeciesAlternatives(): string {
  return `${CHARACTER_SPECIES_PRESETS.map((p) => p.value).join(" | ")} | ...`;
}

const roleLabelByValue = Object.fromEntries(
  CHARACTER_ROLE_PRESETS.map((p) => [p.value, p.label]),
);
const speciesLabelByValue = Object.fromEntries(
  CHARACTER_SPECIES_PRESETS.map((p) => [p.value, p.label]),
);

/** Badge/list display: friendly label for known presets; passthrough for custom text. */
export function formatRoleLabel(stored: string | null | undefined): string {
  if (stored == null || stored === "") return "";
  return roleLabelByValue[stored] ?? stored;
}

export function formatSpeciesLabel(stored: string | null | undefined): string {
  if (stored == null || stored === "") return "";
  return speciesLabelByValue[stored] ?? stored;
}
