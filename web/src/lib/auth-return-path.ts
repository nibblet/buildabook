/** Cookie set before magic-link OTP; read in /auth/callback (no query string on redirect URL). */
export const AUTH_RETURN_COOKIE = "bab_auth_next";

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
