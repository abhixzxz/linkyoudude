"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { formatRoomId, normalizeRoomId, roomPath } from "@/lib/room-id";
import { forgetRoom, useRecentRooms } from "@/lib/recent-rooms";
import { formatRelative, useNow } from "@/lib/use-client-value";
import { Brand } from "@/components/ui/brand";
import { buttonClass } from "@/components/ui/button";
import { ArrowRightIcon, CloseIcon, CompareIcon, LinkIcon, PlusIcon } from "@/components/ui/icons";
import { InstallHint } from "@/components/pwa/install-hint";
import { CreateRoomButton, fetchOwnedRooms, type OwnedRoom } from "./create-room-button";

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

function useOwnedRooms() {
  const [owned, setOwned] = useState<{ rooms: OwnedRoom[]; maxRooms: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOwnedRooms().then((result) => {
      if (!cancelled) setOwned(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return owned;
}

function RecentRooms() {
  const recent = useRecentRooms();
  const owned = useOwnedRooms();
  const now = useNow(60_000);
  const ownedIds = new Set(owned?.rooms.map((room) => room.id));
  // Rooms opened here, plus rooms created here that aren't in that list.
  const rooms = [
    ...recent,
    ...(owned?.rooms ?? [])
      .filter((room) => !recent.some((r) => r.id === room.id))
      .map((room) => ({ id: room.id, lastOpenedAt: Date.parse(room.createdAt) })),
  ];
  if (rooms.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-3">
          Your rooms on this device
        </h2>
        {owned && owned.rooms.length > 0 && (
          <span
            className="text-xs tabular-nums text-ink-3"
            title={`Each device keeps up to ${owned.maxRooms} rooms. Creating another replaces the oldest.`}
          >
            {owned.rooms.length} of {owned.maxRooms} created here
          </span>
        )}
      </div>
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
              <span className="truncate text-sm text-ink-3">
                {ownedIds.has(room.id) ? "yours · " : ""}
                {formatRelative(new Date(room.lastOpenedAt).toISOString(), now)}
              </span>
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
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 sm:h-16 sm:px-6">
          <Brand />
          <Link href="/compare" className={buttonClass("secondary", "sm", "ml-auto")}>
            <CompareIcon size={16} />
            Compare
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-6 pt-4 [@media(max-height:600px)]:gap-4 [@media(max-height:600px)]:pb-4 sm:gap-8 sm:px-6 sm:pb-16 sm:pt-16">
        <section className="mx-auto max-w-2xl text-center">
          <p className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-ink-2 shadow-card sm:inline-flex">
            <span className="size-1.5 rounded-full bg-success" />
            A live clipboard for all your devices
          </p>
          <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] min-[400px]:text-[2.25rem] sm:mt-6 sm:text-6xl">
            Paste here.{" "}
            <span className="font-display text-[1.12em] font-normal tracking-[-0.01em] text-accent">
              Copy there.
            </span>
          </h1>
          <p className="mx-auto mt-2.5 max-w-lg text-[15px] leading-relaxed text-ink-2 [@media(max-height:560px)]:hidden sm:mt-5 sm:text-[17px]">
            Drop text into a room on one device and copy it on another, instantly.
            <span className="hidden sm:inline"> No sign-up, no texting yourself.</span>
          </p>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:grid sm:grid-cols-2 sm:gap-4 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <div className="flex flex-col sm:rounded-3xl sm:border sm:border-line sm:bg-surface sm:p-7 sm:shadow-card">
            <div className="hidden size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink sm:flex">
              <PlusIcon size={22} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight sm:mt-5 sm:text-xl">Create room</h2>
            <p className="mt-1.5 hidden flex-1 text-[15px] leading-relaxed text-ink-2 sm:block">
              Start a fresh room, then open it on any other device with its ID or QR code. Keep up
              to 5; a new one replaces your oldest.
            </p>
            <CreateRoomButton className="mt-3 sm:mt-6" label="Create Room" />
          </div>

          <div className="my-4 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-ink-3 sm:hidden" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <div id="join" className="flex scroll-mt-6 flex-col sm:rounded-3xl sm:border sm:border-line sm:bg-surface sm:p-7 sm:shadow-card">
            <div className="hidden size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink sm:flex">
              <LinkIcon size={22} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight sm:mt-5 sm:text-xl">Join room</h2>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-2 sm:mt-1.5 sm:text-[15px]">
              Enter the ID from your other device<span className="hidden sm:inline">, or paste an invitation link</span>.
            </p>
            <div className="mt-3 sm:mt-6">
              <JoinForm />
            </div>
          </div>
        </section>

        <RecentRooms />
        <div className="sm:hidden">
          <InstallHint compact />
        </div>
        <div className="hidden sm:block">
          <InstallHint />
        </div>

        <Link
          href="/compare"
          className="focus-ring group hidden items-center gap-5 rounded-3xl border border-line bg-surface p-6 shadow-card transition-colors hover:border-line-strong sm:flex sm:p-7"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink">
            <CompareIcon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight">Compare</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-2">
              Paste two versions of a prompt or JSON and see exactly what changed, with change counts.
            </p>
          </div>
          <ArrowRightIcon className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
        </Link>

        <section aria-label="How it works" className="hidden gap-3 sm:grid sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-line/70 p-5">
              <span className="font-mono text-xs font-semibold text-accent">0{index + 1}</span>
              <h3 className="mt-2 font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs leading-relaxed text-ink-3 [@media(max-height:600px)]:hidden">
        Anyone with a room&apos;s ID can read and edit it<span className="hidden sm:inline"> — share it only with your own devices</span>.
      </footer>
    </div>
  );
}
