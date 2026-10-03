"use client";

import { formatRoomId } from "@/lib/room-id";
import type { ConnectionState, Device } from "@/lib/sync/room-engine";
import { Brand } from "@/components/ui/brand";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClass } from "@/components/ui/button";
import { QrIcon, ShareIcon } from "@/components/ui/icons";
import { StatusPill } from "./status-pill";

export function RoomHeader({
  roomId,
  inviteLink,
  connection,
  devices,
  onShare,
  showRoomControls = true,
}: {
  roomId: string;
  inviteLink: string;
  connection?: ConnectionState;
  devices?: Device[];
  onShare: () => void;
  showRoomControls?: boolean;
}) {
  const formatted = formatRoomId(roomId);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center gap-3 px-4 sm:px-6">
        <div className="hidden sm:block">
          <Brand />
        </div>
        <div className="sm:hidden">
          <Brand compact />
        </div>

        {showRoomControls && (
          <>
            <div className="mx-auto flex min-w-0 items-center gap-1.5 sm:ml-6 sm:mr-0">
              <button
                type="button"
                onClick={onShare}
                className="focus-ring flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-left shadow-card transition-colors hover:border-line-strong"
                aria-label={`Room ${formatted}. Show invite options`}
              >
                <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-ink-3 sm:inline">
                  Room
                </span>
                <span className="truncate font-mono text-[15px] font-semibold tracking-[0.06em] text-ink">
                  {formatted}
                </span>
                <ShareIcon size={15} className="shrink-0 text-ink-3 md:hidden" />
              </button>
              <div className="hidden items-center gap-1.5 md:flex">
                <CopyButton text={formatted} label="Copy ID" size="sm" ariaLabel="Copy room ID" />
                <CopyButton
                  text={inviteLink}
                  label="Copy link"
                  size="sm"
                  ariaLabel="Copy invitation link"
                  disabled={!inviteLink}
                />
                <button
                  type="button"
                  onClick={onShare}
                  className={buttonClass("secondary", "iconSm")}
                  aria-label="Show QR code"
                  title="Show QR code"
                >
                  <QrIcon />
                </button>
              </div>
            </div>
            {connection && (
              <div className="ml-auto">
                <StatusPill connection={connection} devices={devices ?? []} />
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
}
