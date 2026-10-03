"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { roomPath } from "@/lib/room-id";
import { buttonClass } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";

export async function requestNewRoom(): Promise<
  { ok: true; roomId: string } | { ok: false; message: string }
> {
  try {
    const response = await fetch("/api/rooms", { method: "POST", cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (response.ok && typeof data?.roomId === "string") {
      return { ok: true, roomId: data.roomId };
    }
    if (data?.error === "not_configured") {
      return { ok: false, message: "The server isn't configured yet (missing Supabase settings)." };
    }
    return { ok: false, message: "Couldn't create a room. Please try again." };
  } catch {
    return { ok: false, message: "You seem to be offline. Connect and try again." };
  }
}

export function CreateRoomButton({
  variant = "primary",
  className = "",
  label = "Create a new room",
}: {
  variant?: "primary" | "secondary";
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    const result = await requestNewRoom();
    if (result.ok) {
      router.push(roomPath(result.roomId));
    } else {
      setError(result.message);
      setPending(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className={buttonClass(variant, "lg", "w-full")}
      >
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        ) : (
          <PlusIcon />
        )}
        {pending ? "Creating room…" : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
