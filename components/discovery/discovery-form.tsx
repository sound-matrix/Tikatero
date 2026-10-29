"use client";
import { useSyncExternalStore, type ReactNode } from "react";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
/** Prevent early native input from being reset when React adopts the server form. */
export function DiscoveryForm({ children, className }: { children: ReactNode; className: string }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return (
    <form action="/events" method="get" role="search" aria-label="Find events">
      <fieldset disabled={!ready} aria-busy={!ready} className={className}>
        <legend className="sr-only">Find events</legend>
        {children}
      </fieldset>
    </form>
  );
}
