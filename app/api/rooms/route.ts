import { createRoom } from "@/lib/server/rooms";
import { handleUnexpected, json } from "@/lib/server/api";

export async function POST() {
  try {
    const roomId = await createRoom();
    return json({ roomId }, 201);
  } catch (error) {
    return handleUnexpected(error);
  }
}
