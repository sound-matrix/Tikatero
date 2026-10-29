"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
export function VenueMap({
  lat,
  lng,
  onPick,
}: {
  lat: string;
  lng: string;
  onPick: (lat: string, lng: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    marker = useRef<CircleMarker | null>(null),
    library = useRef<typeof import("leaflet") | null>(null),
    pick = useRef(onPick);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !element.current) return;
        library.current = L;
        const instance = L.map(element.current).setView([20.5937, 78.9629], 4);
        map.current = instance;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          referrerPolicy: "strict-origin-when-cross-origin",
        }).addTo(instance);
        instance.on("click", (e) => pick.current(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6)));
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current,
      L = library.current;
    if (!ready || !instance || !L) return;
    if (
      lat !== "" &&
      lng !== "" &&
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lng)) &&
      Math.abs(Number(lat)) <= 90 &&
      Math.abs(Number(lng)) <= 180
    ) {
      const point: [number, number] = [Number(lat), Number(lng)];
      if (marker.current) marker.current.setLatLng(point);
      else
        marker.current = L.circleMarker(point, {
          radius: 10,
          color: "#0E9F9A",
          fillColor: "#F25C54",
          fillOpacity: 1,
          weight: 3,
        }).addTo(instance);
      instance.setView(point, Math.max(instance.getZoom(), 13));
    } else {
      marker.current?.remove();
      marker.current = null;
    }
  }, [lat, lng, ready]);
  return (
    <div className="space-y-2">
      <div
        ref={element}
        aria-label="Venue map. Click to choose a pin, or enter coordinates below."
        className="relative z-0 h-72 w-full rounded-xl border border-line"
      />
      {error ? (
        <p role="status" className="text-sm text-muted">
          The map could not load. You can still paste a Maps link or enter coordinates below.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Tap the map to place your venue pin. You can also enter latitude and longitude below.
        </p>
      )}
    </div>
  );
}
