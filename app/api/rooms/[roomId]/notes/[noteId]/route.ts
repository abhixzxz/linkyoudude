import { after } from "next/server";
import { isUuid, parseUpdateNote } from "@/lib/notes";
import { deleteNote, updateNote } from "@/lib/server/rooms";
import { broadcastRoomEvent, noteChangedEvent } from "@/lib/server/supabase";
import {
  apiError,
  handleUnexpected,
  json,
  readJson,
  roomIdFrom,
} from "@/lib/server/api";

type Ctx = RouteContext<"/api/rooms/[roomId]/notes/[noteId]">;

async function resolveIds(ctx: Ctx) {
  const roomId = await roomIdFrom(ctx.params);
  const { noteId } = await ctx.params;
  return { roomId, noteId: isUuid(noteId) ? noteId.toLowerCase() : null };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { roomId, noteId } = await resolveIds(ctx);
  if (!roomId) return apiError("room_not_found", 404, "That room ID isn't valid");
  if (!noteId) return apiError("note_not_found", 404, "That note ID isn't valid");

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const input = parseUpdateNote(body.value);
  if (!input.ok) return apiError("bad_request", 400, input.error);

  try {
    const result = await updateNote(roomId, noteId, input.value);
    switch (result.status) {
      case "ok":
        after(() => broadcastRoomEvent(roomId, noteChangedEvent(result.note)));
        return json({ note: result.note });
      case "conflict":
        // The caller's copy is out of date; send back the current note so it
        // can merge and retry instead of overwriting newer text.
        return apiError("conflict", 409, "This note changed on another device", {
          note: result.note,
        });
      default:
        return apiError("note_not_found", 404, "Note not found");
    }
  } catch (error) {
    return handleUnexpected(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { roomId, noteId } = await resolveIds(ctx);
  if (!roomId) return apiError("room_not_found", 404, "That room ID isn't valid");
  if (!noteId) return apiError("note_not_found", 404, "That note ID isn't valid");

  try {
    const deleted = await deleteNote(roomId, noteId);
    if (deleted) {
      after(() => broadcastRoomEvent(roomId, { type: "note_delete", id: noteId }));
    }
    // Deleting something that's already gone is still a success.
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleUnexpected(error);
  }
}
