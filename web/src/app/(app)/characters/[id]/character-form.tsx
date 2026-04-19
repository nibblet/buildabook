"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { Character } from "@/lib/supabase/types";
import {
  CHARACTER_ROLE_PRESETS,
  CHARACTER_SPECIES_PRESETS,
  PRESET_CUSTOM_SENTINEL,
  type PresetOption,
} from "@/lib/characters/presets";
import { deleteCharacter, updateCharacter } from "../actions";

export function CharacterForm({ character }: { character: Character }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [nameValue, setNameValue] = useState(character.name);
  const [lastProseNote, setLastProseNote] = useState<string | null>(null);

  const nameChangedFromSaved =
    nameValue.trim() !== character.name.trim();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setLastProseNote(null);
      const savedName = String(fd.get("name") || "").trim() || "Untitled";
      const replaceInProse = fd.get("replace_name_in_prose") === "on";
      const { proseScenesUpdated, proseReplacements } = await updateCharacter(
        character.id,
        {
          name: savedName,
          aliases: commaList(fd.get("aliases")),
          role: mergePresetOrCustom(fd, "role_preset", "role_custom"),
          species: mergePresetOrCustom(fd, "species_preset", "species_custom"),
          archetype: emptyToNull(fd.get("archetype")),
          appearance: emptyToNull(fd.get("appearance")),
          backstory: emptyToNull(fd.get("backstory")),
          wound: emptyToNull(fd.get("wound")),
          desire: emptyToNull(fd.get("desire")),
          need: emptyToNull(fd.get("need")),
          voice_notes: emptyToNull(fd.get("voice_notes")),
          powers: emptyToNull(fd.get("powers")),
        },
        { replaceNameInProse: replaceInProse },
      );
      setNameValue(savedName);
      if (proseScenesUpdated > 0) {
        const prior = character.name.trim() || "the previous name";
        setLastProseNote(
          `Updated “${prior}” in ${proseScenesUpdated} scene${proseScenesUpdated === 1 ? "" : "s"} (${proseReplacements} replacement${proseReplacements === 1 ? "" : "s"}).`,
        );
      }
      router.refresh();
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Delete "${character.name}"? Scenes referencing this POV may need updating.`,
      )
    )
      return;
    start(async () => {
      await deleteCharacter(character.id);
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              name="name"
              required
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              autoComplete="off"
            />
          </div>
          {nameChangedFromSaved ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm leading-snug">
              <input
                type="checkbox"
                name="replace_name_in_prose"
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span>
                Also replace{" "}
                <span className="font-medium text-foreground">
                  “{character.name.trim() || "this name"}”
                </span>{" "}
                with the new name in all scene prose (whole words and{" "}
                <span className="font-mono text-xs">@mentions</span>).
              </span>
            </label>
          ) : null}
          <Field
            name="aliases"
            label="Aliases for @mentions"
            hint="Comma-separated nicknames or spellings (e.g. Zoe, Zoë)."
            defaultValue={(character.aliases ?? []).join(", ")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PresetOrCustomField
              key={`role-${character.role ?? ""}`}
              label="Role"
              presets={CHARACTER_ROLE_PRESETS}
              stored={character.role}
              selectName="role_preset"
              customName="role_custom"
            />
            <PresetOrCustomField
              key={`species-${character.species ?? ""}`}
              label="Species"
              presets={CHARACTER_SPECIES_PRESETS}
              stored={character.species}
              selectName="species_preset"
              customName="species_custom"
            />
          </div>
          <Field
            name="archetype"
            label="Archetype"
            defaultValue={character.archetype ?? ""}
          />
          <Area
            name="appearance"
            label="Appearance"
            rows={3}
            defaultValue={character.appearance ?? ""}
          />
          <Area
            name="backstory"
            label="Backstory"
            rows={4}
            defaultValue={character.backstory ?? ""}
          />
          <Area name="wound" label="Wound" rows={3} defaultValue={character.wound ?? ""} />
          <Area name="desire" label="Desire" rows={2} defaultValue={character.desire ?? ""} />
          <Area name="need" label="Need" rows={2} defaultValue={character.need ?? ""} />
          <Area
            name="voice_notes"
            label="Voice notes"
            rows={3}
            defaultValue={character.voice_notes ?? ""}
          />
          <Area name="powers" label="Powers / rules" rows={3} defaultValue={character.powers ?? ""} />
        </CardContent>
      </Card>

      {lastProseNote ? (
        <p className="text-sm text-muted-foreground">{lastProseNote}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/characters"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to characters
        </Link>
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
          <Button type="submit" size="sm">
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

function mergePresetOrCustom(
  fd: FormData,
  presetKey: string,
  customKey: string,
): string | null {
  const preset = String(fd.get(presetKey) ?? "").trim();
  const custom = String(fd.get(customKey) ?? "").trim();
  if (preset === PRESET_CUSTOM_SENTINEL) {
    return custom.length ? custom : null;
  }
  return preset.length ? preset : null;
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function commaList(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function PresetOrCustomField({
  label,
  presets,
  stored,
  selectName,
  customName,
}: {
  label: string;
  presets: readonly PresetOption[];
  stored: string | null;
  selectName: string;
  customName: string;
}) {
  const presetValues = useMemo(
    () => new Set(presets.map((p) => p.value)),
    [presets],
  );

  const initialSelect = useMemo(() => {
    if (!stored) return "";
    if (presetValues.has(stored)) return stored;
    return PRESET_CUSTOM_SENTINEL;
  }, [stored, presetValues]);

  const initialCustom = useMemo(() => {
    if (!stored || presetValues.has(stored)) return "";
    return stored;
  }, [stored, presetValues]);

  const [selectValue, setSelectValue] = useState(initialSelect);
  const [customText, setCustomText] = useState(initialCustom);

  const showCustom = selectValue === PRESET_CUSTOM_SENTINEL;

  const selectClassName =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        name={selectName}
        className={selectClassName}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          setSelectValue(v);
          if (v !== PRESET_CUSTOM_SENTINEL) {
            setCustomText("");
          }
        }}
      >
        <option value="">Not set</option>
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value={PRESET_CUSTOM_SENTINEL}>Other / custom</option>
      </select>
      {showCustom ? (
        <Input
          name={customName}
          className="mt-2"
          placeholder="Describe (stored on save)"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          autoComplete="off"
        />
      ) : (
        <input type="hidden" name={customName} value="" />
      )}
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {hint ? (
          <span className="ml-2 font-normal text-muted-foreground/90">{hint}</span>
        ) : null}
      </Label>
      <Input name={name} defaultValue={defaultValue} required={required} />
    </div>
  );
}

function Area({
  name,
  label,
  rows,
  defaultValue,
}: {
  name: string;
  label: string;
  rows: number;
  defaultValue: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea name={name} rows={rows} defaultValue={defaultValue} />
    </div>
  );
}
