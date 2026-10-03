"use client";

import { useEffect, useState } from "react";
import { formatRoomId } from "@/lib/room-id";
import { Dialog } from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClass } from "@/components/ui/button";
import { ShareIcon } from "@/components/ui/icons";
import { useClientValue } from "@/lib/use-client-value";

function QrCode({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Loaded on demand to keep the room page's initial bundle small.
    import("qrcode").then((QR) =>
      QR.toString(value, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#15151c", light: "#ffffff" },
      }).then((markup) => {
        if (!cancelled) setSvg(markup);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="mx-auto w-full max-w-[13rem] rounded-2xl border border-line bg-white p-4">
      {svg ? (
        <div
          className="aspect-square w-full [&>svg]:size-full"
          role="img"
          aria-label="QR code for the invitation link"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="aspect-square w-full animate-pulse rounded-lg bg-zinc-100" />
      )}
    </div>
  );
}

export function ShareDialog({
  open,
  onClose,
  roomId,
  inviteLink,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  inviteLink: string;
}) {
  const canShare = useClientValue(() => typeof navigator.share === "function", false);

  return (
    <Dialog open={open} onClose={onClose} title="Invite another device">
      {open && inviteLink && <QrCode value={inviteLink} />}
      <p className="mt-4 text-center text-sm leading-relaxed text-ink-2">
        Scan with your phone&apos;s camera, or open this site and enter the room ID.
      </p>
      <p className="mt-3 text-center font-mono text-2xl font-semibold tracking-[0.08em] text-ink">
        {formatRoomId(roomId)}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <CopyButton text={formatRoomId(roomId)} label="Copy ID" ariaLabel="Copy room ID" />
        <CopyButton text={inviteLink} label="Copy link" ariaLabel="Copy invitation link" />
      </div>
      {canShare && (
        <button
          type="button"
          className={buttonClass("primary", "md", "mt-2 w-full")}
          onClick={() => {
            navigator
              .share({ title: "Join my Link Your Dude room", url: inviteLink })
              .catch(() => {});
          }}
        >
          <ShareIcon />
          Share link…
        </button>
      )}
    </Dialog>
  );
}
