import { Brand } from "@/components/ui/brand";
import { RoomNotFound } from "./room-states";

/** Shown for URLs that can't be a room ID at all. */
export function RoomHeaderless() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center px-4 sm:px-6">
          <Brand />
        </div>
      </header>
      <RoomNotFound roomId={null} />
    </div>
  );
}
