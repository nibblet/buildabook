import type { ChemistryPoint } from "@/lib/dashboard/chemistry";

/** Minimal sparkline for relationship intensity vs chapter order (Phase 2). */
export function ChemistryStrip({
  points,
}: {
  points: ChemistryPoint[];
}) {
  if (points.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Relationship beats with intensity will chart here as you confirm them.
      </p>
    );
  }

  const w = 280;
  const h = 64;
  const pad = 6;
  const xs = points.map((_, i) => {
    const n = Math.max(points.length - 1, 1);
    return pad + (i / n) * (w - pad * 2);
  });
  const ys = points.map((p) => {
    const t = (p.intensity + 5) / 10;
    return pad + (1 - t) * (h - pad * 2);
  });
  const d = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(" ");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Chemistry arc (intensity −5…+5 by chapter order)
      </p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full max-w-sm text-primary"
        aria-hidden
      >
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={3} fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}
