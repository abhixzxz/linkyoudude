"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BODY_MAX_LENGTH, TITLE_MAX_LENGTH, sanitizeText } from "@/lib/notes";
import { forgetRoom, useRecentRooms } from "@/lib/recent-rooms";
import { formatRoomId, roomPath } from "@/lib/room-id";
import { uuid } from "@/lib/uuid";
import { Brand } from "@/components/ui/brand";
import { buttonClass } from "@/components/ui/button";
import { ArrowRightIcon, PlusIcon } from "@/components/ui/icons";
import { requestNewRoom } from "./create-room-button";

async function addNote(roomId: string, title: string, body: string) {
  try {
    const response = await fetch(`/api/rooms/${roomId}/notes`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: uuid(),
        clientId: uuid().replace(/-/g, ""),
        title: sanitizeText(title).slice(0, TITLE_MAX_LENGTH),
        body: sanitizeText(body).slice(0, BODY_MAX_LENGTH),
      }),
    });
    if (response.ok) return "ok" as const;
    return response.status === 404 ? ("not_found" as const) : ("error" as const);
  } catch {
    return "offline" as const;
  }
}

export function ShareTarget({ title, body }: { title: string; body: string }) {
  const router = useRouter();
  const rooms = useRecentRooms();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendTo(roomId: string) {
    setBusy(roomId);
    setError(null);
    const result = await addNote(roomId, title, body);
    if (result === "ok") {
      router.replace(roomPath(roomId));
      return;
    }
    setBusy(null);
    if (result === "not_found") {
      forgetRoom(roomId);
      setError("That room no longer exists. Pick another or create a new one.");
    } else {
      setError(
        result === "offline"
          ? "You're offline. Connect and try again."
          : "Couldn't add the note. Please try again.",
      );
    }
  }

  async function sendToNewRoom() {
    setBusy("new");
    setError(null);
    const created = await requestNewRoom();
    if (!created.ok) {
      setBusy(null);
      setError(created.message);
      return;
    }
    await sendTo(created.roomId);
  }

  const empty = !title.trim() && !body.trim();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-xl items-center px-4 sm:px-6">
          <Brand />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-12 pt-4 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Add to a room</h1>

        {empty ? (
          <p className="text-ink-2">
            Nothing was shared. <Link href="/" className="font-medium text-accent">Go home</Link>
          </p>
        ) : (
          <>
            <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
              {title && <p className="mb-2 font-semibold">{title}</p>}
              <p className="line-clamp-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-2">
                {body}
              </p>
            </div>

            {rooms.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Your rooms">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => sendTo(room.id)}
                      className={buttonClass("secondary", "lg", "h-14 w-full justify-between")}
                    >
                      <span>
                        Add to <span className="font-mono font-semibold tracking-[0.06em]">{formatRoomId(room.id)}</span>
                      </span>
                      {busy === room.id ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      ) : (
                        <ArrowRightIcon />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              disabled={busy !== null}
              onClick={sendToNewRoom}
              className={buttonClass(rooms.length ? "ghost" : "primary", "lg", "h-14")}
            >
              <PlusIcon />
              {busy === "new" ? "Creating room…" : "Put it in a new room"}
            </button>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
