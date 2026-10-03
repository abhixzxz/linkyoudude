"use client";

import { useEffect } from "react";

/**
 * Locks the page into an app shell sized to the *visible* viewport.
 *
 * Phone browsers slide the on-screen keyboard over the page without resizing
 * the layout, so a full-height layout ends up half-hidden and the page starts
 * scrolling. This tracks `window.visualViewport` and exposes it as CSS
 * variables (`--vv-top`, `--vv-height`) plus `html[data-keyboard="open"]`, and
 * stops the document itself from scrolling or bouncing while mounted.
 */
export function useVisualViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    root.classList.add("app-shell");
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // While pinch-zoomed, keep the normal layout instead of following the zoom.
        const zoomed = !vv || vv.scale > 1.01;
        const height = zoomed ? window.innerHeight : vv.height;
        const top = zoomed ? 0 : vv.offsetTop;
        root.style.setProperty("--vv-height", `${Math.round(height)}px`);
        root.style.setProperty("--vv-top", `${Math.round(top)}px`);
        root.dataset.keyboard = !zoomed && window.innerHeight - vv.height > 120 ? "open" : "closed";
      });
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.classList.remove("app-shell");
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-top");
      delete root.dataset.keyboard;
    };
  }, []);
}
