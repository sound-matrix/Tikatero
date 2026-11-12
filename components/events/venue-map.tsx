"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { roundVenuePoint } from "@/lib/events/google-venue";
import { useVenueGoogle } from "./venue-google";

const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

function validPoint(lat: string, lng: string) {
  if (!lat.trim() || !lng.trim()) return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 ? point : null;
}

export function VenueMap({
  lat,
  lng,
  onPick,
}: {
  lat: string;
  lng: string;
  onPick: (lat: string, lng: string) => void;
}) {
  const { libraries, failed, onError } = useVenueGoogle();
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<google.maps.Map | null>(null);
  const pin = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [ready, setReady] = useState(false);

  const pick = useEffectEvent((point: google.maps.LatLngLiteral) => {
    const rounded = roundVenuePoint(point);
    onPick(rounded.lat, rounded.lng);
  });
  const fail = useEffectEvent(() => onError());

  useEffect(() => {
    if (!libraries || failed || !element.current) return;
    const container = element.current;
    const { Map, RenderingType } = libraries.maps;
    const { AdvancedMarkerElement, PinElement } = libraries.marker;
    const listeners: google.maps.MapsEventListener[] = [];
    let timeout: number | undefined;
    try {
      const map = new Map(container, {
        center: { lat: 20.5937, lng: 78.9629 },
        zoom: 4,
        mapId,
        renderingType: RenderingType.RASTER,
        clickableIcons: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
      instance.current = map;
      const marker = new AdvancedMarkerElement({ gmpDraggable: true, title: "Venue pin" });
      marker.append(
        new PinElement({ background: "#0E9F9A", borderColor: "#087570", glyphColor: "#FFFFFF" }),
      );
      pin.current = marker;
      timeout = window.setTimeout(() => fail(), 12_000);
      listeners.push(
        map.addListener("tilesloaded", () => {
          window.clearTimeout(timeout);
          setReady(true);
        }),
        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (event.latLng) pick(event.latLng.toJSON());
        }),
        marker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
          if (event.latLng) pick(event.latLng.toJSON());
        }),
      );
    } catch {
      fail();
    }
    return () => {
      window.clearTimeout(timeout);
      listeners.forEach((listener) => listener.remove());
      if (pin.current) pin.current.map = null;
      pin.current = null;
      instance.current = null;
      container.replaceChildren();
    };
  }, [libraries, failed]);

  useEffect(() => {
    const map = instance.current;
    const marker = pin.current;
    if (!map || !marker) return;
    const point = validPoint(lat, lng);
    if (!point) {
      marker.map = null;
      return;
    }
    marker.position = point;
    marker.map = map;
    map.setCenter(point);
    if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
  }, [lat, lng, libraries]);

  if (failed || !libraries) return null;
  return (
    <div className="space-y-2">
      <div
        ref={element}
        role="region"
        aria-label="Venue map"
        aria-busy={!ready}
        className="relative h-72 w-full overflow-hidden rounded-xl border border-line"
      />
      <p className="text-sm text-muted">
        Tap the map or drag the pin to fine-tune the location. You can also edit the coordinates
        below.
      </p>
    </div>
  );
}
