"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatRoomId, normalizeRoomId, roomPath } from "@/lib/room-id";
import { forgetRoom, useRecentRooms } from "@/lib/recent-rooms";
import { formatRelative, useNow } from "@/lib/use-client-value";
import { Brand } from "@/components/ui/brand";
import { buttonClass } from "@/components/ui/button";
import { ArrowRightIcon, CloseIcon, LinkIcon, PlusIcon } from "@/components/ui/icons";
import { InstallHint } from "@/components/pwa/install-hint";
import { CreateRoomButton } from "./create-room-button";

function JoinForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const roomId = normalizeRoomId(value);
    if (!roomId) {
      setError(
        value.trim()
          ? "That doesn't look like a room ID. It has 10 letters and numbers, like k7m2p-9qxr4."
          : "Enter the room ID shown on your other device.",
      );
      return;
    }
    router.push(roomPath(roomId));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <label htmlFor="room-id" className="sr-only">
        Room ID or invitation link
      </label>
      <div className="flex gap-2">
        <input
          id="room-id"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder="abcde-fghjk"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "room-id-error" : undefined}
          className="focus-ring h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-bg px-4 font-mono text-[17px] tracking-[0.06em] text-ink placeholder:text-ink-3/70"
        />
        <button type="submit" className={buttonClass("secondary", "lg", "shrink-0")}>
          Join
          <ArrowRightIcon />
        </button>
      </div>
      {error && (
        <p id="room-id-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function RecentRooms() {
  const rooms = useRecentRooms();
  const now = useNow(60_000);
  if (rooms.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <h2 id="recent-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-3">
        Your rooms on this device
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {rooms.map((room) => (
          <li key={room.id} className="flex items-center gap-2 py-1.5">
            <Link
              href={roomPath(room.id)}
              className="focus-ring group -mx-2 flex min-h-12 flex-1 items-center gap-3 rounded-xl px-2 hover:bg-surface-2"
            >
              <span className="font-mono text-[16px] font-semibold tracking-[0.06em]">
                {formatRoomId(room.id)}
              </span>
              <span className="text-sm text-ink-3">opened {formatRelative(new Date(room.lastOpenedAt).toISOString(), now)}</span>
              <ArrowRightIcon className="ml-auto text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
            </Link>
            <button
              type="button"
              onClick={() => forgetRoom(room.id)}
              className={buttonClass("ghost", "iconSm", "shrink-0")}
              aria-label={`Remove room ${formatRoomId(room.id)} from this device`}
              title="Remove from this device"
            >
              <CloseIcon size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { title: "Create a room", body: "One click on your laptop gives you a private room." },
  { title: "Open it on your phone", body: "Scan the QR code or type the 10-character ID." },
  { title: "Paste here, copy there", body: "Notes sync live in both directions. Tap Copy and go." },
];

export function HomeScreen() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 sm:px-6">
          <Brand />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-16">
        <section className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-ink-2 shadow-card">
            <span className="size-1.5 rounded-full bg-success" />
            A live clipboard for all your devices
          </p>
          <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
            Paste here.{" "}
            <span className="font-display text-[1.12em] font-normal tracking-[-0.01em] text-accent">
              Copy there.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2">
            Drop a prompt into a room on your laptop and it&apos;s on your phone before you can
            unlock it. No sign-up, no texting yourself.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-7">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink">
              <PlusIcon size={22} />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">Create room</h2>
            <p className="mt-1.5 flex-1 text-[15px] leading-relaxed text-ink-2">
              Start a fresh room, then open it on any other device with its ID or QR code.
            </p>
            <CreateRoomButton className="mt-6" label="Create Room" />
          </div>

          <div id="join" className="flex scroll-mt-6 flex-col rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-7">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink">
              <LinkIcon size={22} />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">Join room</h2>
            <p className="mt-1.5 flex-1 text-[15px] leading-relaxed text-ink-2">
              Enter the room ID from your other device, or paste an invitation link.
            </p>
            <div className="mt-6">
              <JoinForm />
            </div>
          </div>
        </section>

        <RecentRooms />
        <InstallHint />

        <section aria-label="How it works" className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-line/70 p-5">
              <span className="font-mono text-xs font-semibold text-accent">0{index + 1}</span>
              <h3 className="mt-2 font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-ink-3">
        Anyone with a room&apos;s ID can read and edit it — share it only with your own devices.
      </footer>
    </div>
  );
}
