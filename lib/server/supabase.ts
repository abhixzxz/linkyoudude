import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { roomTopic } from "@/lib/room-id";
import type { Note, RoomEvent } from "@/lib/notes";

export class NotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
    this.name = "NotConfiguredError";
  }
}

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept the legacy name too, for projects that still use JWT-based keys.
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) throw new NotConfiguredError();
  return { url: url.replace(/\/+$/, ""), secretKey };
}

let adminClient: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS, so it must never reach the browser. */
export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const { url, secretKey } = getConfig();
    adminClient = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}

// Supabase rejects broadcast payloads above its per-message limit (256 KB on
// the free plan). Larger notes are announced with a small "stale" message
// and devices fetch the full text over HTTP instead.
const MAX_BROADCAST_BYTES = 200_000;

export function noteChangedEvent(note: Note): RoomEvent {
  const event: RoomEvent = { type: "note_upsert", note };
  const size = new TextEncoder().encode(JSON.stringify(event)).byteLength;
  return size <= MAX_BROADCAST_BYTES
    ? event
    : { type: "note_stale", id: note.id, version: note.version };
}

/**
 * Pushes an event to every device connected to the room's realtime channel,
 * using Supabase Realtime's REST broadcast endpoint. Delivery is best effort:
 * devices also resync from the database whenever they (re)connect.
 */
export async function broadcastRoomEvent(roomId: string, event: RoomEvent) {
  const { url, secretKey } = getConfig();
  const { type, ...payload } = event;
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { topic: roomTopic(roomId), event: type, payload, private: false },
        ],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error(
        `Realtime broadcast failed (${response.status}): ${await response.text()}`,
      );
    }
  } catch (error) {
    console.error("Realtime broadcast failed:", error);
  }
}
