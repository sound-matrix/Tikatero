import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { VenueGoogle } from "./venue-google";
import { VenueMap } from "./venue-map";
import { VenueSearch } from "./venue-search";

it("shows the manual fallback immediately when a Maps key is absent", () => {
  const markup = renderToStaticMarkup(
    <VenueGoogle>
      <VenueSearch country="IN" inputClass="" onPick={() => {}} />
      <VenueMap lat="" lng="" onPick={() => {}} />
    </VenueGoogle>,
  );
  expect(markup).toContain(
    "Map search is unavailable right now. Type the address or paste a Google Maps link.",
  );
  expect(markup).not.toContain("Venue map");
  expect(markup).not.toContain('role="combobox"');
});
