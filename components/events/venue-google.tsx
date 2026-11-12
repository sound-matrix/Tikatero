"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

async function importVenueLibraries(key: string) {
  const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
  setOptions({ key, v: "weekly" });
  const [maps, places, marker] = await Promise.all([
    importLibrary("maps"),
    importLibrary("places"),
    importLibrary("marker"),
  ]);
  return { maps, places, marker };
}

type VenueLibraries = Awaited<ReturnType<typeof importVenueLibraries>>;
let librariesRequest: Promise<VenueLibraries> | undefined;

const VenueGoogleContext = createContext<{
  libraries: VenueLibraries | null;
  failed: boolean;
  onError: () => void;
}>({ libraries: null, failed: true, onError: () => {} });

export const useVenueGoogle = () => useContext(VenueGoogleContext);

export function VenueGoogle({ apiKey, children }: { apiKey?: string; children: ReactNode }) {
  const [libraries, setLibraries] = useState<VenueLibraries | null>(null);
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (!apiKey) return;
    let active = true;
    const previousAuthFailure = window.gm_authFailure;
    const unavailable = () => {
      if (active) setFailed(true);
    };
    const authFailure = () => {
      unavailable();
      previousAuthFailure?.();
    };
    window.gm_authFailure = authFailure;
    const timeout = window.setTimeout(unavailable, 12_000);
    librariesRequest ??= importVenueLibraries(apiKey);
    librariesRequest
      .then((loaded) => {
        if (active) setLibraries(loaded);
      }, unavailable)
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      if (window.gm_authFailure === authFailure) window.gm_authFailure = previousAuthFailure;
    };
  }, [apiKey]);

  return (
    <VenueGoogleContext.Provider value={{ libraries, failed: failed || !apiKey, onError }}>
      {children}
    </VenueGoogleContext.Provider>
  );
}
