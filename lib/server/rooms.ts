import "server-only";

import { MAX_ROOMS_PER_OWNER, generateRoomId, isRoomId } from "@/lib/room-id";
import {
  parseNote,
  parseRoomSnapshot,
  type CreateNoteInput,
  type Note,
  type RoomSnapshot,
  type UpdateNoteInput,
} from "@/lib/notes";
import { getAdminClient } from "@/lib/server/supabase";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getAdminClient().rpc(fn, args);
  if (error) {
    throw new Error(`${fn} failed: ${error.message}`, { cause: error });
  }
  return data as T;
}

function noteOrThrow(raw: unknown): Note {
  const note = parseNote(raw);
  if (!note) throw new Error("Database returned a malformed note");
  return note;
}

export type OwnedRoom = { id: string; createdAt: string; lastActiveAt: string };

/**
 * Creates a room owned by `ownerId`. If that pushes the owner over
 * MAX_ROOMS_PER_OWNER, the database deletes their oldest rooms in the same
 * transaction and returns their IDs.
 */
export async function createRoom(ownerId: string): Promise<{ roomId: string; evicted: string[] }> {
  // A collision is astronomically unlikely, but retry rather than fail.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateRoomId();
    const result = await rpc<{ created?: boolean; evicted?: unknown }>("lyd_create_room", {
      p_room_id: id,
      p_owner_id: ownerId,
      p_max_rooms: MAX_ROOMS_PER_OWNER,
    });
    if (result?.created) {
      const evicted = Array.isArray(result.evicted) ? result.evicted.filter(isRoomId) : [];
      return { roomId: id, evicted };
    }
  }
  throw new Error("Could not allocate a unique room ID");
}

export async function listOwnedRooms(ownerId: string): Promise<OwnedRoom[]> {
  const raw = await rpc<unknown>("lyd_list_owner_rooms", { p_owner_id: ownerId });
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (room): room is OwnedRoom =>
      isRoomId(room?.id) && typeof room?.createdAt === "string" && typeof room?.lastActiveAt === "string",
  );
}

export async function getRoom(roomId: string): Promise<RoomSnapshot | null> {
  const raw = await rpc<unknown>("lyd_get_room", { p_room_id: roomId });
  if (raw === null) return null;
  const snapshot = parseRoomSnapshot(raw);
  if (!snapshot) throw new Error("Database returned a malformed room");
  return snapshot;
}

type WriteResult =
  | { status: "ok"; note: Note }
  | { status: "conflict"; note: Note }
  | { status: "room_not_found" | "not_found" | "id_taken" };

function parseWriteResult(raw: unknown): WriteResult {
  const result = raw as { status?: string; note?: unknown } | null;
  switch (result?.status) {
    case "ok":
    case "conflict":
      return { status: result.status, note: noteOrThrow(result.note) };
    case "room_not_found":
    case "not_found":
    case "id_taken":
      return { status: result.status };
    default:
      throw new Error("Database returned an unexpected write result");
  }
}

export async function createNote(roomId: string, input: CreateNoteInput) {
  return parseWriteResult(
    await rpc("lyd_create_note", {
      p_room_id: roomId,
      p_id: input.id,
      p_title: input.title,
      p_body: input.body,
      p_client_id: input.clientId,
    }),
  );
}

export async function updateNote(
  roomId: string,
  noteId: string,
  input: UpdateNoteInput,
) {
  return parseWriteResult(
    await rpc("lyd_update_note", {
      p_room_id: roomId,
      p_id: noteId,
      p_base_version: input.baseVersion,
      p_title: input.title ?? null,
      p_body: input.body ?? null,
      p_client_id: input.clientId,
    }),
  );
}

export async function deleteNote(roomId: string, noteId: string) {
  return rpc<boolean>("lyd_delete_note", { p_room_id: roomId, p_id: noteId });
}
