import { after } from "next/server";
import { parseCreateNote } from "@/lib/notes";
import { createNote } from "@/lib/server/rooms";
import { broadcastRoomEvent, noteChangedEvent } from "@/lib/server/supabase";
import {
  apiError,
  handleUnexpected,
  json,
  readJson,
  roomIdFrom,
} from "@/lib/server/api";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/rooms/[roomId]/notes">,
) {
  const roomId = await roomIdFrom(ctx.params);
  if (!roomId) return apiError("room_not_found", 404, "That room ID isn't valid");

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const input = parseCreateNote(body.value);
  if (!input.ok) return apiError("bad_request", 400, input.error);

  try {
    const result = await createNote(roomId, input.value);
    switch (result.status) {
      case "ok":
        after(() => broadcastRoomEvent(roomId, noteChangedEvent(result.note)));
        return json({ note: result.note }, 201);
      case "room_not_found":
        return apiError("room_not_found", 404, "Room not found");
      default:
        return apiError("conflict", 409, "That note ID is already in use");
    }
  } catch (error) {
    return handleUnexpected(error);
  }
}
