"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/pwa";

export function ServiceWorker() {
  useEffect(() => captureInstallPrompt(), []);

  useEffect(() => {
    // In development a caching worker just gets in the way of hot reloads.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // A new build ID means a new worker URL, so each deploy refreshes the
    // offline cache and old caches are dropped when it activates.
    const version = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev");
    navigator.serviceWorker
      .register(`/sw.js?v=${version}`, { scope: "/", updateViaCache: "none" })
      .catch((error) => console.warn("Service worker registration failed:", error));
  }, []);

  return null;
}
