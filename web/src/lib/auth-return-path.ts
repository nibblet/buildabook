/** Cookie set before magic-link OTP; read in `/auth/callback`. Magic links omit `?next=` on `redirectTo`; password reset passes `next` there so mail apps still reach `/auth/set-password` without this cookie. */
export const AUTH_RETURN_COOKIE = "bab_auth_next";

/** Where password-reset and recovery links send the user after `/auth/callback`. */
export const AUTH_SET_PASSWORD_PATH = "/auth/set-password";

/** Call from the browser before auth redirects (magic link, password reset). */
export function setBrowserAuthReturnCookie(path: string): void {
  if (typeof document === "undefined") return;
  const next = safeInternalPath(path);
  const secure = window.location.protocol === "https:";
  document.cookie = [
    `${AUTH_RETURN_COOKIE}=${encodeURIComponent(next)}`,
    "path=/",
    "max-age=3600",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  try {
    const decoded = decodeURIComponent(raw.trim());
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/";
    return decoded;
  } catch {
    return "/";
  }
}
