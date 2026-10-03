"use client";

import { useEffect, useEffectEvent } from "react";
import { CloseIcon } from "./icons";

export type Toast = {
  id: number | string;
  tone: "info" | "warning" | "error" | "success";
  message: string;
};

const toneDot: Record<Toast["tone"], string> = {
  info: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-danger",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // The parent re-renders on every keystroke; don't restart the timer for that.
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    const timer = setTimeout(dismiss, toast.tone === "info" || toast.tone === "success" ? 3500 : 8000);
    return () => clearTimeout(timer);
  }, [toast.tone]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="animate-toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-pop"
    >
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${toneDot[toast.tone]}`} />
      <p className="flex-1 leading-relaxed">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="focus-ring -m-1 rounded-lg p-1 text-ink-3 hover:text-ink"
        aria-label="Dismiss"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

export function ToastStack({
  toasts,
  onDismiss,
  className = "bottom-4",
}: {
  toasts: Toast[];
  onDismiss: (id: Toast["id"]) => void;
  /** Vertical placement; the stack is absolutely positioned in its container. */
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4 lg:bottom-6 ${className}`}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}
