import { after } from "next/server";
import { MAX_ROOMS_PER_OWNER } from "@/lib/room-id";
import { createRoom, listOwnedRooms } from "@/lib/server/rooms";
import { broadcastRoomEvent } from "@/lib/server/supabase";
import { ensureOwnerId, readOwnerId } from "@/lib/server/owner";
import { handleUnexpected, json } from "@/lib/server/api";

/** Rooms created by this browser, newest first. */
export async function GET() {
  try {
    const ownerId = await readOwnerId();
    const rooms = ownerId ? await listOwnedRooms(ownerId) : [];
    return json({ rooms, maxRooms: MAX_ROOMS_PER_OWNER });
  } catch (error) {
    return handleUnexpected(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await ensureOwnerId(request);
    const { roomId, evicted } = await createRoom(ownerId);
    if (evicted.length > 0) {
      // Devices still inside a deleted room find out immediately.
      after(() =>
        Promise.all(evicted.map((id) => broadcastRoomEvent(id, { type: "room_deleted" }))),
      );
    }
    return json({ roomId, evicted, maxRooms: MAX_ROOMS_PER_OWNER }, 201);
  } catch (error) {
    return handleUnexpected(error);
  }
}
