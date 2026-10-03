import type { ConnectionState, Device } from "@/lib/sync/room-engine";

const STATES: Record<ConnectionState, { label: string; dot: string; pulse: boolean }> = {
  live: { label: "Live", dot: "bg-success", pulse: false },
  connecting: { label: "Connecting…", dot: "bg-warning", pulse: true },
  reconnecting: { label: "Reconnecting…", dot: "bg-warning", pulse: true },
  offline: { label: "Offline", dot: "bg-ink-3", pulse: false },
};

export function StatusPill({
  connection,
  devices,
}: {
  connection: ConnectionState;
  devices: Device[];
}) {
  const state = STATES[connection];
  const count = devices.length;
  const deviceList = devices
    .map((device) => (device.self ? `${device.label} (this device)` : device.label))
    .join(", ");

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-2.5 sm:px-3 text-[13px] font-medium text-ink-2"
      title={deviceList ? `Connected: ${deviceList}` : undefined}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {state.pulse && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${state.dot}`} />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${state.dot}`} />
      </span>
      <span>{state.label}</span>
      {connection === "live" && count > 0 && (
        <span className="text-ink-3" aria-label={`${count} connected`}>
          · {count}
          <span className="hidden sm:inline"> {count === 1 ? "device" : "devices"}</span>
        </span>
      )}
    </div>
  );
}
