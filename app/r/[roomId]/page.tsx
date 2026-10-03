import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatRoomId, normalizeRoomId, roomPath } from "@/lib/room-id";
import { RoomHeaderless } from "@/components/room/room-headerless";
import { RoomScreen } from "@/components/room/room-screen";

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata(props: PageProps<"/r/[roomId]">): Promise<Metadata> {
  const roomId = normalizeRoomId(decode((await props.params).roomId));
  return {
    title: roomId ? `Room ${formatRoomId(roomId)}` : "Room not found",
    // Room links are private invitations; keep them out of search engines.
    robots: { index: false, follow: false },
  };
}

export default async function RoomPage(props: PageProps<"/r/[roomId]">) {
  const raw = decode((await props.params).roomId);
  const roomId = normalizeRoomId(raw);
  if (!roomId) return <RoomHeaderless />;
  // Canonical, readable URL: /r/abcde-fghjk
  if (raw !== formatRoomId(roomId)) redirect(roomPath(roomId));
  return <RoomScreen key={roomId} roomId={roomId} />;
}
