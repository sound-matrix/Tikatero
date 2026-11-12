"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  venueFromPlace,
  venueLocationBias,
  venuePlaceFields,
  type VenueDetails,
} from "@/lib/events/google-venue";
import { useVenueGoogle } from "./venue-google";

type Prediction = google.maps.places.PlacePrediction;
const unavailable =
  "Map search is unavailable right now. Type the address or paste a Google Maps link.";

export function VenueSearch({
  country,
  inputClass,
  onPick,
}: {
  country: string;
  inputClass: string;
  onPick: (venue: VenueDetails) => void;
}) {
  const { libraries, failed, onError } = useVenueGoogle();
  const places = libraries?.places;
  const id = useId();
  const listId = `${id}-suggestions`;
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const selection = useRef<AbortController | null>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [picking, setPicking] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<{ query: string; predictions: Prediction[] } | null>(null);
  const query = value.trim();
  const predictions = results?.query === query ? results.predictions : undefined;
  const open = focused && !!predictions?.length;

  useEffect(() => () => selection.current?.abort(), []);
  useEffect(() => {
    if (failed) selection.current?.abort();
  }, [failed]);

  useEffect(() => {
    if (!places || failed || query.length < 2) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      const region = /^[A-Z]{2}$/.test(country) ? country : "IN";
      try {
        session.current ??= new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          region: region.toLowerCase(),
          locationBias: venueLocationBias(region),
          sessionToken: session.current,
        });
        if (!current) return;
        setResults({
          query,
          predictions: suggestions.flatMap(({ placePrediction }) =>
            placePrediction ? [placePrediction] : [],
          ),
        });
      } catch {
        if (current) onError();
      }
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [country, failed, onError, places, query]);

  async function select(prediction: Prediction) {
    if (selection.current) return;
    const request = new AbortController();
    selection.current = request;
    session.current = null;
    setPicking(true);
    setFocused(false);
    setValue("");
    setResults(null);
    setActive(-1);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: venuePlaceFields });
      if (request.signal.aborted) return;
      const venue = venueFromPlace(place);
      if (!venue) {
        onError();
        return;
      }
      onPick(venue);
    } catch {
      if (!request.signal.aborted) onError();
    } finally {
      selection.current = null;
      if (!request.signal.aborted) setPicking(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && focused) {
      event.preventDefault();
      setFocused(false);
      setActive(-1);
      return;
    }
    if (!predictions?.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setFocused(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next =
        active === -1 && direction === -1
          ? predictions.length - 1
          : (active + direction + predictions.length) % predictions.length;
      setActive(next);
      window.requestAnimationFrame(() =>
        document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" }),
      );
    } else if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault();
      void select(predictions[active]);
    }
  }

  if (failed)
    return (
      <p role="status" className="text-sm text-muted">
        {unavailable}
      </p>
    );
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-semibold text-ink">
        Search for your venue
      </label>
      <input
        id={id}
        className={`${inputClass} focus-visible:ring-2 focus-visible:ring-teal`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Venue name or address"
        value={value}
        maxLength={200}
        disabled={!places || picking}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActive(-1);
        }}
        onChange={(event) => {
          if (!event.target.value.trim()) session.current = null;
          setValue(event.target.value);
          setResults(null);
          setFocused(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      <div
        hidden={!open}
        className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
      >
        <ul
          id={listId}
          role="listbox"
          aria-label="Venue suggestions"
          className="max-h-40 overflow-y-auto sm:max-h-56"
        >
          {open &&
            predictions.map((prediction, index) => (
              <li
                key={prediction.placeId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                className="flex min-h-12 cursor-pointer items-center border-b border-line px-3 py-2 text-sm text-ink hover:bg-teal-soft aria-selected:bg-teal-soft"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void select(prediction)}
              >
                {prediction.text.toString()}
              </li>
            ))}
        </ul>
        <p className="px-3 py-2 text-right text-xs text-[#5E5E5E]" translate="no">
          Powered by <span className="whitespace-nowrap">Google Maps</span>
        </p>
      </div>
      {picking && (
        <p role="status" className="text-sm text-muted">
          Loading venue details…
        </p>
      )}
      {focused && predictions?.length === 0 && (
        <p role="status" className="text-sm text-muted">
          No venues found. Try a different search or enter the address below.
        </p>
      )}
    </div>
  );
}
