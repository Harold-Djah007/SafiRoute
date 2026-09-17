"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Next's dev server relies on its own HMR/WebSocket lifecycle. A previously
    // installed SafiRoute service worker can otherwise keep serving a cached
    // /field shell after the dev server has stopped, leaving the browser stuck
    // on "Opening SafiRoute…" while HMR reports ERR_CONNECTION_REFUSED.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      );
      if ("caches" in window) {
        void caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("safiroute-"))
              .map((key) => caches.delete(key))
          )
        );
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
