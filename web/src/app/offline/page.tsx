export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page hasn&apos;t been cached yet. Edits you make to scenes you&apos;ve already
        opened will be saved locally and synced when you reconnect.
      </p>
    </main>
  );
}
