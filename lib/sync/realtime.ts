import {
  REALTIME_SUBSCRIBE_STATES,
  RealtimeClient,
  type RealtimeChannel,
} from "@supabase/realtime-js";
import { ROOM_EVENT_NAMES, parseRoomEvent } from "@/lib/notes";
import { roomTopic } from "@/lib/room-id";
import type { Device, RealtimeFactory } from "./room-engine";

// Only the public URL and publishable (anon) key reach the browser. That key
// can't touch the database (RLS, no policies); it only lets this page listen
// on the room's channel, whose name is derived from the secret room ID.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type PresenceMeta = { clientId?: unknown; device?: unknown };

export function describeDevice(userAgent: string): string {
  if (/iPad/.test(userAgent)) return "iPad";
  if (/iPhone|iPod/.test(userAgent)) return "iPhone";
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? "Android phone" : "Android tablet";
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/Macintosh/.test(userAgent)) {
    return typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 ? "iPad" : "Mac";
  }
  if (/Windows/.test(userAgent)) return "Windows PC";
  if (/CrOS/.test(userAgent)) return "Chromebook";
  if (/Linux/.test(userAgent)) return "Linux PC";
  return "Device";
}

export const connectRealtime: RealtimeFactory = (roomId, clientId, handlers) => {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
    console.warn(
      "Realtime is disabled: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Falling back to polling.",
    );
    return null;
  }
  const key = SUPABASE_PUBLIC_KEY;

  const client = new RealtimeClient(`${SUPABASE_URL.replace(/\/+$/, "")}/realtime/v1`, {
    params: { apikey: key },
    accessToken: async () => key,
    heartbeatIntervalMs: 15_000,
    // A missed heartbeat means the socket is dead even if it hasn't closed.
    heartbeatCallback: (status) => {
      if (status === "timeout" || status === "disconnected" || status === "error") {
        handlers.onStatus("disconnected");
      }
    },
  });

  const device = describeDevice(navigator.userAgent);
  let closed = false;
  const channel: RealtimeChannel = client.channel(roomTopic(roomId), {
    config: { broadcast: { self: false }, presence: { key: clientId } },
  });

  const reportPresence = () => {
    const state = channel.presenceState<PresenceMeta>();
    const devices = new Map<string, Device>();
    for (const metas of Object.values(state)) {
      for (const meta of metas) {
        if (typeof meta.clientId !== "string") continue;
        devices.set(meta.clientId, {
          clientId: meta.clientId,
          label: typeof meta.device === "string" ? meta.device.slice(0, 40) : "Device",
          self: meta.clientId === clientId,
        });
      }
    }
    handlers.onPresence([...devices.values()]);
  };

  for (const name of ROOM_EVENT_NAMES) {
    channel.on("broadcast", { event: name }, (message) => {
      // Anyone holding the room ID could publish here, so validate everything.
      const event = parseRoomEvent(name, message.payload);
      if (event) handlers.onEvent(event);
    });
  }
  channel.on("presence", { event: "sync" }, reportPresence);

  // The library rejoins on its own after drops; SUBSCRIBED fires on every join.
  channel.subscribe((status) => {
    if (closed) return;
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      handlers.onStatus("subscribed");
      void channel.track({ clientId, device, at: Date.now() });
    } else {
      handlers.onStatus("disconnected");
    }
  });

  return {
    close() {
      closed = true;
      void client.removeChannel(channel);
      client.disconnect();
    },
    wake() {
      // Mobile browsers freeze sockets in the background; reconnect promptly
      // instead of waiting for the next heartbeat to notice.
      if (!client.isConnected()) client.connect();
    },
  };
};
