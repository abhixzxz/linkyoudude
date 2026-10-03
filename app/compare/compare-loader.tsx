"use client";

import dynamic from "next/dynamic";

// Browser-only: the screen restores your last comparison from localStorage.
const CompareScreen = dynamic(
  () => import("@/components/compare/compare-screen").then((m) => m.CompareScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <span className="size-7 animate-spin rounded-full border-[3px] border-accent border-r-transparent" />
      </div>
    ),
  },
);

export function CompareLoader() {
  return <CompareScreen />;
}
