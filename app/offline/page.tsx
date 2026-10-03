import type { Metadata } from "next";
import { Brand } from "@/components/ui/brand";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline" };

// Served by the service worker when a page isn't cached and there's no network.
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <Brand />
        </div>
      </header>
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          This page isn&apos;t available without a connection. Rooms you&apos;ve opened on this device
          still load their last synced notes, and anything you type syncs once you&apos;re back online.
        </p>
        <RetryButton />
      </main>
    </div>
  );
}
