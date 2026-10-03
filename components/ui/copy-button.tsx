"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { buttonClass } from "./button";
import { CheckIcon, CopyIcon } from "./icons";

type CopyButtonProps = {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  className?: string;
  /** Visually hide the label (it stays available to screen readers). */
  iconOnly?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied!",
  variant = "secondary",
  size = "md",
  className = "",
  iconOnly = false,
  disabled = false,
  ariaLabel,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function onClick(event: React.MouseEvent) {
    event.stopPropagation();
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  const shown = state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : label;
  const copied = state === "copied";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className={buttonClass(
        variant,
        size,
        `${copied && variant !== "primary" ? "!border-success/40 !text-success" : ""} ${className}`,
      )}
    >
      {copied ? <CheckIcon size={size === "lg" ? 20 : 18} /> : <CopyIcon size={size === "lg" ? 20 : 18} />}
      <span className={iconOnly ? "sr-only" : ""}>{shown}</span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
