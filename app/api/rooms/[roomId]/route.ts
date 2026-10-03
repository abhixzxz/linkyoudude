import { getRoom } from "@/lib/server/rooms";
import { apiError, handleUnexpected, json, roomIdFrom } from "@/lib/server/api";

export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[roomId]">) {
  const roomId = await roomIdFrom(ctx.params);
  if (!roomId) return apiError("room_not_found", 404, "That room ID isn't valid");
  try {
    const snapshot = await getRoom(roomId);
    if (!snapshot) return apiError("room_not_found", 404, "Room not found");
    return json(snapshot);
  } catch (error) {
    return handleUnexpected(error);
  }
}
