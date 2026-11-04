"use client";

import { useEffect } from "react";

export function TicketOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/ticket-sw.js", { scope: "/t/" }).catch(() => {
      // Offline cache is optional. The ticket still works while this page is open.
    });
  }, []);
  return null;
}
