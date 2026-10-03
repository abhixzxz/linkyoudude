"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_ROOMS_PER_OWNER, formatRoomId, isRoomId, roomPath } from "@/lib/room-id";
import { forgetRoom } from "@/lib/recent-rooms";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PlusIcon } from "@/components/ui/icons";

export type OwnedRoom = { id: string; createdAt: string; lastActiveAt: string };

/** Rooms this browser created (newest first), or null if the server can't be reached. */
export async function fetchOwnedRooms(): Promise<{ rooms: OwnedRoom[]; maxRooms: number } | null> {
  try {
    const response = await fetch("/api/rooms", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const rooms = Array.isArray(data?.rooms) ? data.rooms.filter((r: OwnedRoom) => isRoomId(r?.id)) : [];
    return { rooms, maxRooms: typeof data?.maxRooms === "number" ? data.maxRooms : MAX_ROOMS_PER_OWNER };
  } catch {
    return null;
  }
}

export async function requestNewRoom(): Promise<
  { ok: true; roomId: string; evicted: string[] } | { ok: false; message: string }
> {
  try {
    const response = await fetch("/api/rooms", { method: "POST", cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (response.ok && typeof data?.roomId === "string") {
      const evicted: string[] = Array.isArray(data.evicted) ? data.evicted.filter(isRoomId) : [];
      evicted.forEach(forgetRoom);
      return { ok: true, roomId: data.roomId, evicted };
    }
    if (data?.error === "not_configured") {
      return { ok: false, message: "The server isn't configured yet (missing Supabase settings)." };
    }
    return { ok: false, message: "Couldn't create a room. Please try again." };
  } catch {
    return { ok: false, message: "You seem to be offline. Connect and try again." };
  }
}

/** Where to go after creating a room; mentions any room it replaced. */
export function newRoomUrl(roomId: string, evicted: string[]) {
  return evicted.length ? `${roomPath(roomId)}?cleared=${evicted.join(",")}` : roomPath(roomId);
}

export function CreateRoomButton({
  variant = "primary",
  className = "",
  label = "Create a new room",
}: {
  variant?: "primary" | "secondary";
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replace, setReplace] = useState<OwnedRoom | null>(null);

  async function create(confirmed: boolean) {
    setPending(true);
    setError(null);
    if (!confirmed) {
      // At the limit, the oldest room gets deleted: ask first.
      const owned = await fetchOwnedRooms();
      if (owned && owned.rooms.length >= owned.maxRooms) {
        setReplace(owned.rooms[owned.rooms.length - 1]);
        setPending(false);
        return;
      }
    }
    setReplace(null);
    const result = await requestNewRoom();
    if (result.ok) {
      router.push(newRoomUrl(result.roomId, result.evicted));
    } else {
      setError(result.message);
      setPending(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => create(false)}
        disabled={pending}
        className={buttonClass(variant, "lg", "w-full")}
      >
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        ) : (
          <PlusIcon />
        )}
        {pending ? "Creating room…" : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Dialog open={replace !== null} onClose={() => setReplace(null)} title="Replace your oldest room?">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Each device can keep up to {MAX_ROOMS_PER_OWNER} rooms, and you&apos;re at the limit. Creating a
          new one permanently deletes your oldest room
          {replace && (
            <>
              {" "}
              <span className="font-mono font-semibold text-ink">{formatRoomId(replace.id)}</span> (created{" "}
              {new Date(replace.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })})
            </>
          )}{" "}
          and its notes on every device.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setReplace(null)} className={buttonClass("secondary", "lg")}>
            Cancel
          </button>
          <button type="button" onClick={() => create(true)} className={buttonClass("primary", "lg")}>
            Replace oldest
          </button>
        </div>
      </Dialog>
    </div>
  );
}
