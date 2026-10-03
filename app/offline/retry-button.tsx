"use client";

import { buttonClass } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className={buttonClass("primary", "lg", "mt-7")}
    >
      <RefreshIcon />
      Try again
    </button>
  );
}
