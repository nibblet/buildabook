"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityForRename } from "@/components/find-replace-panel";

type Mode = "character" | "world_element" | "adhoc";

type ConfirmCtx = {
  entityType: "character" | "world_element";
  entityId: string | null;
  oldName: string;
  newName: string;
  updateEntityRecord: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: EntityForRename[];
  worldElements: EntityForRename[];
  onConfirm: (ctx: ConfirmCtx) => void;
  canUpdateEntityRecord: boolean;
};

export function EntityRenameDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open ? <DialogBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({
  onOpenChange,
  characters,
  worldElements,
  onConfirm,
  canUpdateEntityRecord,
}: Props) {
  const initialMode: Mode =
    characters.length > 0 ? "character" : worldElements.length > 0 ? "world_element" : "adhoc";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selectedId, setSelectedId] = useState<string>("");
  const [adhocOld, setAdhocOld] = useState("");
  const [adhocKind, setAdhocKind] = useState<"character" | "world_element">("character");
  const [newName, setNewName] = useState("");
  const [updateRecord, setUpdateRecord] = useState(true);

  const list = mode === "character" ? characters : mode === "world_element" ? worldElements : [];
  const selected = list.find((e) => e.id === selectedId);

  function confirm() {
    const oldName = mode === "adhoc" ? adhocOld.trim() : selected?.name?.trim() ?? "";
    const next = newName.trim();
    if (!oldName || !next || oldName === next) return;
    onConfirm({
      entityType: mode === "adhoc" ? adhocKind : mode,
      entityId: mode === "adhoc" ? null : selected?.id ?? null,
      oldName,
      newName: next,
      updateEntityRecord: mode !== "adhoc" && updateRecord && canUpdateEntityRecord,
    });
  }

  const canConfirm =
    (mode === "adhoc"
      ? adhocOld.trim().length > 0
      : !!selected) && newName.trim().length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename character or location</DialogTitle>
        <DialogDescription>
          Find every mention (including possessives like Sam&apos;s) and review
          before applying.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 text-xs">
          <ModeChip
            active={mode === "character"}
            disabled={characters.length === 0}
            onClick={() => setMode("character")}
          >
            Character
          </ModeChip>
          <ModeChip
            active={mode === "world_element"}
            disabled={worldElements.length === 0}
            onClick={() => setMode("world_element")}
          >
            Location / world
          </ModeChip>
          <ModeChip active={mode === "adhoc"} onClick={() => setMode("adhoc")}>
            Ad-hoc name
          </ModeChip>
        </div>

        {mode === "adhoc" ? (
          <div className="grid gap-2">
            <Label className="text-xs">Original name (as it appears in prose)</Label>
            <Input
              value={adhocOld}
              onChange={(e) => setAdhocOld(e.target.value)}
              placeholder="e.g. Sam"
            />
            <Label className="text-xs">This is a…</Label>
            <select
              value={adhocKind}
              onChange={(e) => setAdhocKind(e.target.value as "character" | "world_element")}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="character">Character</option>
              <option value="world_element">Location / world</option>
            </select>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label className="text-xs">{mode === "character" ? "Character" : "Location / world element"}</Label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">— Pick one —</option>
              {list.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.aliases.length > 0 ? ` (aka ${e.aliases.join(", ")})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-2">
          <Label className="text-xs">New name</Label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Jordan"
          />
        </div>

        {mode !== "adhoc" && canUpdateEntityRecord ? (
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={updateRecord}
              onChange={(e) => setUpdateRecord(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Also rename the entity record and add the old name as an alias.
              Wiki-link mentions like <code className="font-mono">[[{selected?.name ?? "Name"}]]</code>{" "}
              will keep resolving via aliases.
            </span>
          </label>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" disabled={!canConfirm} onClick={confirm}>
          Find matches
        </Button>
      </DialogFooter>
    </>
  );
}

function ModeChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        active
          ? "rounded border border-primary bg-primary/10 px-2 py-1 text-primary"
          : "rounded border border-border bg-background px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
      }
    >
      {children}
    </button>
  );
}
