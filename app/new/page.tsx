import type { Metadata } from "next";
import { NewRoom } from "./new-room";

export const metadata: Metadata = {
  title: "New room",
  robots: { index: false, follow: false },
};

// Target of the "New room" app shortcut (long-press the installed app icon).
export default function NewRoomPage() {
  return <NewRoom />;
}
