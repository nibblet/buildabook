import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

type ArcRow = {
  scene_id: string;
  character_id: string;
  reader_knowledge: string | null;
  character_knowledge: string | null;
  arc_note: string | null;
  updated_at: string;
};

export default async function ArcTrackerPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");
  const supabase = await supabaseServer();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", project.id);
  const chapterIds = (chapters ?? []).map((c) => c.id as string);

  const header = (
    <header>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Phase 3
      </p>
      <h1 className="font-serif text-2xl font-semibold tracking-tight">
        Arc tracker
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Reader vs character knowledge is saved per scene when you fill fields in{" "}
        <span className="font-medium text-foreground">Arc tracker</span> on the scene page.
        Nothing is auto-generated from your cast list.
      </p>
    </header>
  );

  if (chapterIds.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        {header}
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Add a chapter first, then arc notes from any scene.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: projectScenes } = await supabase
    .from("scenes")
    .select("id")
    .in("chapter_id", chapterIds);
  const projectSceneIdSet = new Set(
    (projectScenes ?? []).map((s) => s.id as string),
  );

  if (projectSceneIdSet.size === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        {header}
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No scenes in this project yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("scene_character_arcs")
    .select(
      "scene_id, character_id, reader_knowledge, character_knowledge, arc_note, updated_at",
    )
    .order("updated_at", { ascending: false });

  const arcs = ((rows ?? []) as ArcRow[]).filter((a) =>
    projectSceneIdSet.has(a.scene_id),
  );

  const arcSceneIds = Array.from(new Set(arcs.map((a) => a.scene_id)));
  const characterIds = Array.from(new Set(arcs.map((a) => a.character_id)));
  const [{ data: scenes }, { data: chars }] = await Promise.all([
    arcSceneIds.length
      ? supabase
          .from("scenes")
          .select("id, title, chapter_id")
          .in("id", arcSceneIds)
      : Promise.resolve({ data: [] }),
    characterIds.length
      ? supabase.from("characters").select("id, name").in("id", characterIds)
      : Promise.resolve({ data: [] }),
  ]);

  const sceneMap = new Map((scenes ?? []).map((s) => [s.id as string, s]));
  const charMap = new Map((chars ?? []).map((c) => [c.id as string, c]));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      {header}

      {arcs.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-8 text-sm text-muted-foreground">
            <p>No arc rows saved yet.</p>
            <p>
              Open a scene, expand <strong className="text-foreground">Arc tracker</strong>,
              type at least one field for a character, then tab away or click elsewhere so it
              saves. This page lists every scene/character pair you have recorded.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {arcs.map((arc) => {
            const sceneRow = sceneMap.get(arc.scene_id);
            const charRow = charMap.get(arc.character_id);
            return (
              <li key={`${arc.scene_id}-${arc.character_id}`}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {charRow?.name ?? "Character"} ·{" "}
                      <Link
                        href={`/scenes/${arc.scene_id}`}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {sceneRow?.title || "Untitled scene"}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {arc.reader_knowledge ? (
                      <p>
                        <span className="font-medium">Reader knows:</span>{" "}
                        {arc.reader_knowledge}
                      </p>
                    ) : null}
                    {arc.character_knowledge ? (
                      <p>
                        <span className="font-medium">Character knows:</span>{" "}
                        {arc.character_knowledge}
                      </p>
                    ) : null}
                    {arc.arc_note ? (
                      <p>
                        <span className="font-medium">Arc note:</span>{" "}
                        {arc.arc_note}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
