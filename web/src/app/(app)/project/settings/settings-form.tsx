"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { Project, StyleSample } from "@/lib/supabase/types";
import {
  createStyleSample,
  deleteStyleSample,
  saveProjectSettings,
  updateStyleSample,
} from "./actions";

export function SettingsForm({
  project,
  styleSamples,
}: {
  project: Project;
  styleSamples: StyleSample[];
}) {
  const [title, setTitle] = useState(project.title);
  const [premise, setPremise] = useState(project.premise ?? "");
  const [styleNotes, setStyleNotes] = useState(project.style_notes ?? "");
  const [paranormalType, setParanormalType] = useState(
    project.paranormal_type ?? "",
  );
  const [targetWordcount, setTargetWordcount] = useState(
    project.target_wordcount,
  );
  const [partnerAlias, setPartnerAlias] = useState(
    project.persona_aliases?.partner ?? "",
  );
  const [profilerAlias, setProfilerAlias] = useState(
    project.persona_aliases?.profiler ?? "",
  );
  const [specialistAlias, setSpecialistAlias] = useState(
    project.persona_aliases?.specialist ?? "",
  );
  const [proofreaderAlias, setProofreaderAlias] = useState(
    project.persona_aliases?.proofreader ?? "",
  );
  const [analystAlias, setAnalystAlias] = useState(
    project.persona_aliases?.analyst ?? "",
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [, start] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    start(async () => {
      try {
        await saveProjectSettings({
          title,
          premise,
          styleNotes,
          paranormalType,
          targetWordcount,
          personaAliases: {
            partner: partnerAlias.trim() || undefined,
            profiler: profilerAlias.trim() || undefined,
            specialist: specialistAlias.trim() || undefined,
            proofreader: proofreaderAlias.trim() || undefined,
            analyst: analystAlias.trim() || undefined,
          },
        });
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <>
    <form onSubmit={onSave} className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Book title" value={title} onChange={setTitle} />
          <div>
            <Label className="text-xs text-muted-foreground">Premise</Label>
            <Textarea
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Voice notes</Label>
            <Textarea
              value={styleNotes}
              onChange={(e) => setStyleNotes(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Paranormal type"
              value={paranormalType}
              onChange={setParanormalType}
            />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Target wordcount
              </Label>
              <Input
                type="number"
                value={targetWordcount}
                onChange={(e) => setTargetWordcount(Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium">Name your team (optional)</p>
          <p className="text-xs text-muted-foreground">
            Give your teammates names if you&apos;d like. Leave blank to keep
            the defaults.
          </p>
          <Field
            label="The Partner (co-writer)"
            value={partnerAlias}
            onChange={setPartnerAlias}
            placeholder="e.g. Sam"
          />
          <Field
            label="The Profiler (coach)"
            value={profilerAlias}
            onChange={setProfilerAlias}
            placeholder="e.g. Dana"
          />
          <Field
            label="The Specialist (genre)"
            value={specialistAlias}
            onChange={setSpecialistAlias}
            placeholder=""
          />
          <Field
            label="The Proofreader"
            value={proofreaderAlias}
            onChange={setProofreaderAlias}
            placeholder=""
          />
          <Field
            label="The Analyst"
            value={analystAlias}
            onChange={setAnalystAlias}
            placeholder=""
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {status === "saved" && (
          <span className="text-xs text-emerald-600">Saved.</span>
        )}
        {status === "error" && (
          <span className="text-xs text-destructive">Save failed.</span>
        )}
        <Button type="submit" className="gap-2" disabled={status === "saving"}>
          <Save className="h-4 w-4" />
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>

    <StyleSamplesSection samples={styleSamples} />
    </>
  );
}

function StyleSamplesSection({ samples }: { samples: StyleSample[] }) {
  const router = useRouter();
  const [, start] = useTransition();

  function addSample() {
    start(async () => {
      await createStyleSample({ label: "", content: "" });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <p className="text-sm font-medium">Voice samples</p>
          <p className="text-xs text-muted-foreground">
            Short excerpts the Partner uses to match tone. Label them (e.g.
            dialogue, introspection).
          </p>
        </div>

        <div className="space-y-6">
          {samples.map((s) => (
            <StyleSampleRow key={s.id} sample={s} />
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addSample}>
          <Plus className="h-4 w-4" /> Add sample
        </Button>
      </CardContent>
    </Card>
  );
}

function StyleSampleRow({ sample }: { sample: StyleSample }) {
  const router = useRouter();
  const [label, setLabel] = useState(sample.label ?? "");
  const [content, setContent] = useState(sample.content ?? "");
  const [, start] = useTransition();

  // After router.refresh(), merge server values into fields without remounting on each keystroke.
  /* eslint-disable react-hooks/set-state-in-effect -- sync controlled fields when sample prop updates */
  useEffect(() => {
    setLabel(sample.label ?? "");
    setContent(sample.content ?? "");
  }, [sample.id, sample.label, sample.content]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function saveRow() {
    start(async () => {
      await updateStyleSample(sample.id, { label, content });
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Remove this voice sample?")) return;
    start(async () => {
      await deleteStyleSample(sample.id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <Field
        label="Label"
        value={label}
        onChange={setLabel}
        placeholder="e.g. dialogue"
      />
      <div>
        <Label className="text-xs text-muted-foreground">Excerpt</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="mt-1"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" onClick={saveRow}>
          Save sample
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
