import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0–100 */
  pct: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ProgressRing({
  pct,
  size = 72,
  strokeWidth = 5,
  className,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", className)}
      aria-label={`${pct}% complete`}
      role="img"
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-border"
      />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        className="stroke-primary transition-all duration-500"
      />
      {/* Label */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-foreground font-sans text-[11px] font-semibold"
        style={{ transform: `rotate(90deg) translate(0, 0)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {pct}%
      </text>
    </svg>
  );
}
