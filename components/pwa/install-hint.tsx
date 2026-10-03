"use client";

import { useState } from "react";
import { promptInstall, useCanPromptInstall } from "@/lib/pwa";
import { useClientValue } from "@/lib/use-client-value";
import { buttonClass } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand";
import { CloseIcon, DownloadIcon, ShareIcon } from "@/components/ui/icons";

const DISMISS_KEY = "lyd:install-hint-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallHint() {
  const canPrompt = useCanPromptInstall();
  const standalone = useClientValue(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    true,
  );
  const isIos = useClientValue(
    () =>
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1),
    false,
  );
  const storedDismissed = useClientValue(readDismissed, true);
  const [dismissedNow, setDismissedNow] = useState(false);

  if (standalone || storedDismissed || dismissedNow || (!canPrompt && !isIos)) return null;

  const dismiss = () => {
    setDismissedNow(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  return (
    <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <BrandMark size={44} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold tracking-tight">Install Link Your Dude</p>
        {canPrompt ? (
          <p className="mt-0.5 text-sm text-ink-2">Open it from your home screen like an app.</p>
        ) : (
          <p className="mt-0.5 text-sm text-ink-2">
            Tap <ShareIcon size={15} className="-mt-0.5 inline" aria-label="Share" /> in Safari, then{" "}
            <span className="font-medium text-ink">Add to Home Screen</span>.
          </p>
        )}
      </div>
      {canPrompt && (
        <button type="button" onClick={() => void promptInstall()} className={buttonClass("primary", "md")}>
          <DownloadIcon />
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className={buttonClass("ghost", "iconSm", "-mr-1 shrink-0")}
        aria-label="Dismiss install hint"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
