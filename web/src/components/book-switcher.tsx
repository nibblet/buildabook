"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createProject,
  switchProject,
} from "@/app/(app)/projects/actions";
import { clearProjectCache } from "@/lib/offline/repo";
import type { ProjectSummary } from "@/lib/projects";

type BookSwitcherProps = {
  projects: ProjectSummary[];
  activeProjectId: string;
  defaultTitle: string;
};

export function BookSwitcher({
  projects,
  activeProjectId,
  defaultTitle,
}: BookSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [creating, setCreating] = useState<"blank" | "import" | null>(null);

  function handleSwitch(projectId: string) {
    if (projectId === activeProjectId || pending) return;
    startTransition(async () => {
      await clearProjectCache();
      await switchProject(projectId);
      router.refresh();
    });
  }

  async function handleCreate(mode: "blank" | "import") {
    if (creating) return;
    setCreating(mode);
    try {
      await clearProjectCache();
      await createProject({
        title: title.trim() || undefined,
        mode,
      });
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={activeProjectId}
        onValueChange={handleSwitch}
        disabled={pending}
      >
        <SelectTrigger className="min-w-[12rem] max-w-full flex-1">
          <SelectValue placeholder="Select a book" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        disabled={pending}
        onClick={() => {
          setTitle(defaultTitle);
          setDialogOpen(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        New book
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new book</DialogTitle>
            <DialogDescription>
              Each book has its own characters, settings, and manuscript. Choose
              how you want to begin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="new-book-title">
              Title
            </label>
            <Input
              id="new-book-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={!!creating}
              onClick={() => handleCreate("blank")}
            >
              {creating === "blank" ? "Creating…" : "Start blank"}
            </Button>
            <Button
              type="button"
              disabled={!!creating}
              onClick={() => handleCreate("import")}
            >
              {creating === "import" ? "Creating…" : "Import draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
