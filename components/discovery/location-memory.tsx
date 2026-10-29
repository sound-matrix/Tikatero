"use client";
import { useEffect } from "react";
export function LocationMemory({ city, country }: { city: string; country: string }) {
  useEffect(() => {
    document.cookie = `tikatero-location=${encodeURIComponent(JSON.stringify({ city, country }))}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [city, country]);
  return null;
}
