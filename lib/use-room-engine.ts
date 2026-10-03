"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RoomEngine } from "@/lib/sync/room-engine";
import { connectRealtime } from "@/lib/sync/realtime";

export function useRoomEngine(roomId: string) {
  const [engine] = useState(() => new RoomEngine(roomId, { realtime: connectRealtime }));

  useEffect(() => {
    engine.start();
    return () => engine.dispose();
  }, [engine]);

  const view = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  return { engine, view };
}
