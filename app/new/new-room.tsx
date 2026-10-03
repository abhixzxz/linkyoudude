"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/ui/brand";
import { buttonClass } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import { newRoomUrl, requestNewRoom } from "@/components/home/create-room-button";

export function NewRoom() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    // Strict Mode runs effects twice in development; create only one room.
    if (started.current === attempt) return;
    started.current = attempt;
    requestNewRoom().then((result) => {
      if (result.ok) router.replace(newRoomUrl(result.roomId, result.evicted));
      else setError(result.message);
    });
  }, [attempt, router]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:h-16 sm:px-6">
          <Brand />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-24 text-center">
        {error ? (
          <>
            <p className="max-w-xs text-[15px] leading-relaxed text-ink-2">{error}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setAttempt((n) => n + 1);
                }}
                className={buttonClass("primary", "lg")}
              >
                <RefreshIcon />
                Try again
              </button>
              <Link href="/" className={buttonClass("secondary", "lg")}>
                Home
              </Link>
            </div>
          </>
        ) : (
          <>
            <span className="size-8 animate-spin rounded-full border-[3px] border-accent border-r-transparent" />
            <p className="text-[15px] text-ink-2">Creating your room…</p>
          </>
        )}
      </main>
    </div>
  );
}
