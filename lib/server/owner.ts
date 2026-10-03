import "server-only";

import { cookies } from "next/headers";

// Anonymous per-browser identity, used only to cap how many rooms one browser
// keeps. httpOnly, so page scripts can't read or forge it.
const COOKIE = "lyd_owner";
const PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400; // the longest browsers allow

export async function readOwnerId(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && PATTERN.test(value) ? value : null;
}

/** Returns this browser's owner ID, issuing one if needed, and refreshes the cookie. */
export async function ensureOwnerId(request: Request): Promise<string> {
  const id = (await readOwnerId()) ?? Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return id;
}
