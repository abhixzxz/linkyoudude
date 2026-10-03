import { useSyncExternalStore } from "react";
import { isRoomId } from "@/lib/room-id";
import { storageKey } from "@/lib/sync/room-engine";

// A per-device convenience list of rooms opened here, so a phone can jump back
// into "the room" without retyping the ID. Not used for any room state.
const KEY = "lyd:recent-rooms:v1";
const CHANGE_EVENT = "lyd:recent-rooms";
const MAX_RECENT = 8;

export type RecentRoom = { id: string; lastOpenedAt: number };

export function getRecentRooms(): RecentRoom[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentRoom =>
        isRoomId(item?.id) && typeof item?.lastOpenedAt === "number",
    );
  } catch {
    return [];
  }
}

function save(rooms: RecentRoom[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms.slice(0, MAX_RECENT)));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function rememberRoom(id: string) {
  const others = getRecentRooms().filter((room) => room.id !== id);
  save([{ id, lastOpenedAt: Date.now() }, ...others]);
}

/** Removes the room from this device's list and drops its offline copy. */
export function forgetRoom(id: string) {
  save(getRecentRooms().filter((room) => room.id !== id));
  try {
    localStorage.removeItem(storageKey(id));
  } catch {}
}

const EMPTY: RecentRoom[] = [];
let cached: { raw: string | null; rooms: RecentRoom[] } = { raw: null, rooms: EMPTY };

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function snapshot(): RecentRoom[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cached.raw) cached = { raw, rooms: raw ? getRecentRooms() : EMPTY };
  return cached.rooms;
}

export function useRecentRooms(): RecentRoom[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
