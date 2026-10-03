"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MAX_ROOMS_PER_OWNER, formatRoomId } from "@/lib/room-id";
import { buttonClass } from "@/components/ui/button";
import { ClipboardIcon, NoteIcon, PlusIcon, QrIcon, RefreshIcon } from "@/components/ui/icons";
import { CreateRoomButton } from "@/components/home/create-room-button";

function StatePanel({
  icon,
  title,
  children,
  actions,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-16 text-center sm:py-24">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-line bg-surface text-accent shadow-card">
        {icon}
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
      {actions && <div className="mt-7 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">{actions}</div>}
    </div>
  );
}

export function RoomLoading() {
  return (
    <div className="mx-auto grid w-full max-w-[90rem] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[22rem_1fr]" aria-busy="true">
      <span className="sr-only">Loading room…</span>
      <div className="flex flex-col gap-2.5">
        <div className="h-11 animate-pulse rounded-xl bg-surface-2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[7.5rem] animate-pulse rounded-2xl border border-line bg-surface" />
        ))}
      </div>
      <div className="hidden h-[70vh] animate-pulse rounded-3xl border border-line bg-surface lg:block" />
    </div>
  );
}

export function RoomNotFound({
  roomId,
  closed = false,
}: {
  roomId: string | null;
  /** The room was deleted while open (its creator went over the room limit). */
  closed?: boolean;
}) {
  return (
    <StatePanel
      icon={<NoteIcon size={26} />}
      title={closed ? "This room was cleared" : "Room not found"}
      actions={
        <>
          <CreateRoomButton variant="primary" />
          <Link href="/#join" className={buttonClass("secondary", "lg")}>
            Join a different room
          </Link>
        </>
      }
    >
      {roomId && closed ? (
        <p>
          Room <span className="font-mono font-semibold text-ink">{formatRoomId(roomId)}</span> was
          deleted because the device that created it started a new room. Each device keeps up to{" "}
          {MAX_ROOMS_PER_OWNER} rooms, and the oldest one makes way.
        </p>
      ) : roomId ? (
        <p>
          There&apos;s no room with the ID{" "}
          <span className="font-mono font-semibold text-ink">{formatRoomId(roomId)}</span>. Check
          for a typo, or create a fresh room.
        </p>
      ) : (
        <p>
          That doesn&apos;t look like a room ID. Room IDs have 10 letters and numbers, like{" "}
          <span className="font-mono font-semibold text-ink">k7m2p-9qxr4</span>.
        </p>
      )}
    </StatePanel>
  );
}

export function RoomError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <StatePanel
      icon={<RefreshIcon size={26} />}
      title="Couldn't connect"
      actions={
        <button type="button" onClick={onRetry} className={buttonClass("primary", "lg")}>
          <RefreshIcon />
          Try again
        </button>
      }
    >
      <p>{message ?? "Something went wrong while loading this room."}</p>
      <p className="mt-2 text-sm text-ink-3">We&apos;ll keep retrying in the background.</p>
    </StatePanel>
  );
}

export function RoomNotConfigured({ message }: { message: string | null }) {
  return (
    <StatePanel icon={<RefreshIcon size={26} />} title="Server isn't configured yet">
      <p>{message || "The Supabase environment variables are missing."}</p>
      <p className="mt-2 text-sm text-ink-3">
        See the README for setup steps, then restart the server or redeploy.
      </p>
    </StatePanel>
  );
}

export function EmptyRoom({
  roomId,
  onNewNote,
  onPaste,
  onShare,
}: {
  roomId: string;
  onNewNote: () => void;
  onPaste: () => void;
  onShare: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-line-strong bg-surface/60 px-5 py-8 lg:py-0">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink sm:mb-5 sm:size-14">
          <ClipboardIcon size={24} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">This room is empty</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Add a note on any device and it shows up on every other device in this room, live.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button type="button" onClick={onPaste} className={buttonClass("primary", "lg")}>
            <ClipboardIcon />
            Paste as note
          </button>
          <button type="button" onClick={onNewNote} className={buttonClass("secondary", "lg")}>
            <PlusIcon />
            New note
          </button>
        </div>
        <button
          type="button"
          onClick={onShare}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-accent hover:underline"
        >
          <QrIcon size={16} />
          Open this room on your phone ({formatRoomId(roomId)})
        </button>
      </div>
    </div>
  );
}
