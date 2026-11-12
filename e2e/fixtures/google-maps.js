// Intercepted Maps JS script. It uses synthetic places and draws no real map tiles.
(() => {
  const venue = {
    displayName: "Taj Krishna",
    formattedAddress: "Road No. 1, Banjara Hills, Hyderabad, Telangana, India",
    googleMapsURI: "https://maps.google.com/?cid=123456789",
    addressComponents: [
      { types: ["locality", "political"], longText: "Hyderabad" },
      { types: ["country", "political"], shortText: "IN", longText: "India" },
    ],
    location: { toJSON: () => ({ lat: 17.41781583, lng: 78.44950124 }) },
  };

  class MockMap {
    constructor(container, options) {
      this.container = container;
      this.zoom = options.zoom;
      container.dataset.mapId = options.mapId;
      Object.assign(container.style, {
        backgroundColor: "#eaf0e7",
        backgroundImage:
          "linear-gradient(30deg, transparent 47%, #fff 48% 52%, transparent 53%), " +
          "linear-gradient(125deg, transparent 46%, #fff 47% 54%, transparent 55%)",
        backgroundSize: "94px 76px, 131px 93px",
      });
      const caption = document.createElement("span");
      caption.textContent = "Simulated map";
      caption.style.cssText = "position:absolute;bottom:8px;left:8px;background:white;padding:4px";
      container.append(caption);
    }
    addListener(type, callback) {
      if (type === "tilesloaded") {
        const timer = window.setTimeout(callback, 0);
        return { remove: () => window.clearTimeout(timer) };
      }
      const handler = (event) => {
        if (event.target.closest("[data-venue-pin]")) return;
        callback({ latLng: { toJSON: () => ({ lat: 17.41900562, lng: 78.44940774 }) } });
      };
      this.container.addEventListener(type, handler);
      return { remove: () => this.container.removeEventListener(type, handler) };
    }
    setCenter() {}
    setZoom(zoom) {
      this.zoom = zoom;
    }
    getZoom() {
      return this.zoom;
    }
  }

  class MockPin {
    constructor(options) {
      const pin = document.createElement("span");
      pin.style.cssText = `
        width: 30px; height: 30px; display: block; transform: rotate(-45deg);
        border-radius: 50% 50% 50% 0; border: 2px solid ${options.borderColor};
        background: ${options.background};
      `;
      return pin;
    }
  }

  class MockAdvancedMarker {
    constructor({ title, gmpDraggable }) {
      this.element = document.createElement("button");
      this.element.type = "button";
      this.element.title = title;
      this.element.dataset.venuePin = "";
      this.element.dataset.draggable = String(gmpDraggable);
      this.element.style.cssText = "position:absolute;top:50%;left:50%;cursor:grab";
      this.element.addEventListener("pointerdown", (event) =>
        this.element.setPointerCapture(event.pointerId),
      );
    }
    append(pin) {
      this.element.append(pin);
    }
    set map(map) {
      if (map) map.container.append(this.element);
      else this.element.remove();
    }
    addListener(type, callback) {
      const handler = () =>
        callback({ latLng: { toJSON: () => ({ lat: 17.41825712, lng: 78.44959381 }) } });
      if (type === "dragend") this.element.addEventListener("pointerup", handler);
      return { remove: () => this.element.removeEventListener("pointerup", handler) };
    }
  }

  const maps = window.google.maps;
  window.venueGoogleFixture = { libraries: [], requests: [], fields: [] };
  const libraries = {
    maps: { Map: MockMap, RenderingType: { RASTER: "RASTER" } },
    marker: { AdvancedMarkerElement: MockAdvancedMarker, PinElement: MockPin },
    places: {
      AutocompleteSessionToken: class {
        id = crypto.randomUUID();
      },
      AutocompleteSuggestion: {
        async fetchAutocompleteSuggestions({ input, sessionToken, region, locationBias }) {
          window.venueGoogleFixture.requests.push({ input, sessionToken, region, locationBias });
          const suggestions = [
            "Taj Krishna, Banjara Hills, Hyderabad",
            "Taj Deccan, Hyderabad",
          ].map((text, index) => ({
            placePrediction: {
              placeId: `mock-venue-${index}`,
              text: { toString: () => text },
              toPlace: () => ({
                ...venue,
                async fetchFields({ fields }) {
                  window.venueGoogleFixture.fields.push(fields);
                },
              }),
            },
          }));
          return { suggestions };
        },
      },
    },
  };
  maps.importLibrary = async (name) => {
    window.venueGoogleFixture.libraries.push(name);
    return libraries[name];
  };
  maps.__ib__();
})();
