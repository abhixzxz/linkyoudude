import "server-only";

import { normalizeRoomId } from "@/lib/room-id";
import { NotConfiguredError } from "@/lib/server/supabase";

const NO_STORE = { "Cache-Control": "no-store" };

// Notes are capped at 100k characters; JSON escaping can at most ~6x that.
const MAX_REQUEST_BYTES = 1_000_000;

export type ApiErrorCode =
  | "bad_request"
  | "room_not_found"
  | "note_not_found"
  | "conflict"
  | "payload_too_large"
  | "not_configured"
  | "server_error";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

export function apiError(
  code: ApiErrorCode,
  status: number,
  message?: string,
  extra?: Record<string, unknown>,
) {
  return json({ error: code, message, ...extra }, status);
}

export async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: apiError("payload_too_large", 413, "Request body is too large"),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: apiError("bad_request", 400, "Request body must be JSON"),
    };
  }
}

/** Resolves the `[roomId]` segment, accepting both `abcde-fghjk` and `abcdefghjk`. */
export async function roomIdFrom(params: Promise<{ roomId: string }>) {
  const { roomId } = await params;
  return normalizeRoomId(roomId);
}

export function handleUnexpected(error: unknown) {
  if (error instanceof NotConfiguredError) {
    return apiError("not_configured", 503, error.message);
  }
  console.error(error);
  return apiError("server_error", 500, "Something went wrong on the server");
}
