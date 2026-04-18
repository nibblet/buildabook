/**
 * Design system motion tokens.
 *
 * Use these wherever you add CSS transitions or animations.
 * Import `dur` and `ease` and compose the `transition` property value.
 *
 * Example:
 *   style={{ transition: `opacity ${dur.base}ms ${ease.standard}` }}
 *
 * In Tailwind, prefer arbitrary values:
 *   className={`transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)]`}
 */

export const ease = {
  /** Default: most UI state changes */
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  /** Elements entering the screen */
  enter: "cubic-bezier(0, 0, 0, 1)",
  /** Elements leaving the screen */
  exit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export const dur = {
  /** 120ms — pill state changes, micro-interactions */
  fast: 120,
  /** 180ms — card hover, mode-color crossfades */
  base: 180,
  /** 280ms — panel reveals, dropdown opens */
  slow: 280,
  /** 420ms — focus mode toggle, first-run reveals */
  focus: 420,
} as const;

/**
 * Returns a CSS transition string for one or more properties.
 * Usage: transition(["opacity", "transform"], dur.slow, ease.enter)
 */
export function transition(
  props: string[],
  duration: number = dur.base,
  easing: string = ease.standard,
): string {
  return props.map((p) => `${p} ${duration}ms ${easing}`).join(", ");
}
