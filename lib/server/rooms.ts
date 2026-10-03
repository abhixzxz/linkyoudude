import "server-only";

import { generateRoomId } from "@/lib/room-id";
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

export async function createRoom(): Promise<string> {
  // A collision is astronomically unlikely, but retry rather than fail.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateRoomId();
    if (await rpc<boolean>("lyd_create_room", { p_room_id: id })) return id;
  }
  throw new Error("Could not allocate a unique room ID");
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
