import "leaflet/dist/leaflet.css";
import * as L from "leaflet";

interface SearchResult {
    lat: string;
    lon: string;
    display_name: string;
}

interface ReverseResult {
    display_name: string;
}

let lastGeocodingRequestAt = 0;
let geocodingQueue = Promise.resolve();

async function queryNominatim<T>(url: string): Promise<T> {
    let resolveRequest: (value: T) => void = () => undefined;
    let rejectRequest: (reason?: unknown) => void = () => undefined;
    const result = new Promise<T>((resolve, reject) => {
        resolveRequest = resolve;
        rejectRequest = reject;
    });

    geocodingQueue = geocodingQueue.then(async () => {
        const delay = Math.max(0, 1100 - (Date.now() - lastGeocodingRequestAt));
        if (delay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        lastGeocodingRequestAt = Date.now();

        try {
            const response = await fetch(url, { headers: { Accept: "application/json" } });
            if (!response.ok) {
                throw new Error(`Location search failed with status ${response.status}.`);
            }
            resolveRequest((await response.json()) as T);
        } catch (error) {
            rejectRequest(error);
        }
    });

    return result;
}

function geocodingUrl(path: "search" | "reverse", parameters: URLSearchParams): string {
    return `https://nominatim.openstreetmap.org/${path}?${parameters.toString()}`;
}

function createDialog(): HTMLDialogElement {
    const dialog = document.createElement("dialog");
    dialog.className = "location-picker-dialog";
    dialog.id = "mapLocationDialog";
    dialog.setAttribute("aria-labelledby", "mapLocationTitle");
    dialog.innerHTML = `
      <div class="location-picker-content">
        <header class="location-picker-header">
          <div>
            <p class="location-picker-eyebrow">Request location</p>
            <h2 id="mapLocationTitle">Choose a location</h2>
          </div>
          <button class="location-picker-close" type="button" aria-label="Close map"><span aria-hidden="true">&times;</span></button>
        </header>
        <form class="location-search-form" role="search">
          <label class="visually-hidden" for="mapLocationSearch">Search for a place or address</label>
          <input id="mapLocationSearch" name="query" type="search" maxlength="200" placeholder="Search for a place or address" autocomplete="street-address" required>
          <button class="maps-search-button" type="submit"><span class="material-symbols-outlined" aria-hidden="true">search</span><span>Search</span></button>
        </form>
        <p class="location-picker-status" role="status" aria-live="polite">Search for a location or click the map to place a pin.</p>
        <ul class="location-search-results" aria-label="Location search results" hidden></ul>
        <div class="facility-location-map" role="application" aria-label="Map. Click to place a pin; drag the pin to adjust its position."></div>
        <div class="location-picker-footer">
          <div>
            <p class="location-picker-coordinate-label">Selected coordinates</p>
            <output class="location-picker-coordinates">No pin selected</output>
          </div>
          <div class="location-picker-actions">
            <button class="location-picker-cancel" type="button">Cancel</button>
            <button class="maps-search-button" type="button" disabled>Use this location</button>
          </div>
        </div>
        <p class="location-picker-attribution">Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Search by <a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noopener noreferrer">Nominatim</a>.</p>
      </div>`;
    document.body.append(dialog);
    return dialog;
}

export function initializeLocationPickers(): void {
    const addressInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>("[data-map-location]")
    );
    if (addressInputs.length === 0) {
        return;
    }

    const dialog = createDialog();
    const searchForm = dialog.querySelector<HTMLFormElement>(".location-search-form");
    const searchInput = dialog.querySelector<HTMLInputElement>("#mapLocationSearch");
    const searchButton = dialog.querySelector<HTMLButtonElement>(".location-search-form [type='submit']");
    const status = dialog.querySelector<HTMLElement>(".location-picker-status");
    const resultsList = dialog.querySelector<HTMLUListElement>(".location-search-results");
    const mapElement = dialog.querySelector<HTMLElement>(".facility-location-map");
    const coordinatesOutput = dialog.querySelector<HTMLOutputElement>(".location-picker-coordinates");
    const confirmButton = dialog.querySelector<HTMLButtonElement>(".location-picker-actions .maps-search-button");
    const closeButton = dialog.querySelector<HTMLButtonElement>(".location-picker-close");
    const cancelButton = dialog.querySelector<HTMLButtonElement>(".location-picker-cancel");

    if (
        !searchForm || !searchInput || !searchButton || !status || !resultsList ||
        !mapElement || !coordinatesOutput || !confirmButton || !closeButton || !cancelButton
    ) {
        throw new Error("The location picker dialog is missing required controls.");
    }

    let activeInput: HTMLInputElement | undefined;
    let activeLatitude: HTMLInputElement | undefined;
    let activeLongitude: HTMLInputElement | undefined;
    let map: L.Map | undefined;
    let marker: L.Marker | undefined;
    let selectedAddress = "";
    let selectionVersion = 0;
    let searchVersion = 0;
    let confirmedLocation = false;

    const setStatus = (text: string, isError = false): void => {
        status.textContent = text;
        status.classList.toggle("is-error", isError);
    };

    const updateCoordinates = (location?: L.LatLng): void => {
        coordinatesOutput.textContent = location
            ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : "No pin selected";
        confirmButton.disabled = !location;
    };

    const setMarker = (location: L.LatLng, address = ""): void => {
        selectedAddress = address;
        selectionVersion += 1;

        if (!map) {
            return;
        }
        if (!marker) {
            marker = L.marker(location, {
                draggable: true,
                icon: L.divIcon({
                    className: "facility-map-pin",
                    html: "<span></span>",
                    iconSize: [24, 34],
                    iconAnchor: [12, 34],
                }),
            }).addTo(map);
            marker.on("dragend", () => {
                const position = marker?.getLatLng();
                if (position) {
                    void resolvePinAddress(position);
                }
            });
        } else {
            marker.setLatLng(location);
        }
        updateCoordinates(location);
    };

    const resolvePinAddress = async (location: L.LatLng): Promise<void> => {
        setMarker(location);
        confirmButton.disabled = true;
        const requestVersion = selectionVersion;
        setStatus("Finding the address for this pin…");
        const parameters = new URLSearchParams({
            format: "jsonv2",
            lat: String(location.lat),
            lon: String(location.lng),
            zoom: "18",
        });
        try {
            const result = await queryNominatim<ReverseResult>(
                geocodingUrl("reverse", parameters)
            );
            if (requestVersion !== selectionVersion) {
                return;
            }
            selectedAddress = result.display_name || "Dropped map pin";
            confirmButton.disabled = false;
            setStatus("Pin placed. Drag it to adjust the location.");
        } catch (error) {
            console.error("Unable to look up the selected map location.", error);
            if (requestVersion === selectionVersion) {
                selectedAddress = "Dropped map pin";
                confirmButton.disabled = false;
                setStatus("The pin is set, but its address could not be looked up. You can still use this location.", true);
            }
        }
    };

    const renderSearchResults = (results: SearchResult[]): void => {
        resultsList.replaceChildren();
        resultsList.hidden = results.length === 0;
        for (const result of results) {
            const item = document.createElement("li");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "location-search-result";
            button.textContent = result.display_name;
            button.addEventListener("click", () => {
                const location = L.latLng(Number(result.lat), Number(result.lon));
                setMarker(location, result.display_name);
                map?.setView(location, 17);
                resultsList.hidden = true;
                resultsList.replaceChildren();
                setStatus("Location found. Move the pin if needed, then use this location.");
            });
            item.append(button);
            resultsList.append(item);
        }
    };

    const restoreInputLocation = (): void => {
        marker?.remove();
        marker = undefined;
        selectedAddress = "";
        selectionVersion += 1;
        const latitude = Number(activeLatitude?.value);
        const longitude = Number(activeLongitude?.value);
        if (
            !activeLatitude?.value || !activeLongitude?.value ||
            !Number.isFinite(latitude) || !Number.isFinite(longitude)
        ) {
            updateCoordinates();
            return;
        }
        const location = L.latLng(latitude, longitude);
        setMarker(location, activeInput?.value ?? "");
        map?.setView(location, 17);
    };

    const ensureMap = (): void => {
        if (!map) {
            map = L.map(mapElement, { zoomControl: true }).setView([0, 0], 2);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
            }).addTo(map);
            map.on("click", (event: L.LeafletMouseEvent) => {
                void resolvePinAddress(event.latlng);
            });
        }
        restoreInputLocation();
        window.setTimeout(() => map?.invalidateSize(), 100);
    };

    searchForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const query = searchInput.value.trim();
        if (!query) {
            searchInput.focus();
            return;
        }
        const requestVersion = ++searchVersion;
        searchButton.disabled = true;
        resultsList.hidden = true;
        resultsList.replaceChildren();
        setStatus("Searching OpenStreetMap…");
        const parameters = new URLSearchParams({
            format: "jsonv2",
            addressdetails: "1",
            limit: "5",
            q: query,
        });
        try {
            const results = await queryNominatim<SearchResult[]>(
                geocodingUrl("search", parameters)
            );
            if (requestVersion !== searchVersion) {
                return;
            }
            if (results.length === 0) {
                setStatus("No matching places found. Try adding a city or postal code.");
                return;
            }
            renderSearchResults(results);
            setStatus(`${results.length} location${results.length === 1 ? "" : "s"} found. Choose one, or click the map to place a pin.`);
        } catch (error) {
            console.error("Unable to search OpenStreetMap locations.", error);
            if (requestVersion === searchVersion) {
                setStatus("Location search is unavailable right now. You can still click the map to place a pin.", true);
            }
        } finally {
            if (requestVersion === searchVersion) {
                searchButton.disabled = false;
            }
        }
    });

    const closeDialog = (): void => dialog.close();
    closeButton.addEventListener("click", closeDialog);
    cancelButton.addEventListener("click", closeDialog);
    dialog.addEventListener("close", () => {
        if (!confirmedLocation) {
            restoreInputLocation();
        }
        confirmedLocation = false;
    });

    confirmButton.addEventListener("click", () => {
        const location = marker?.getLatLng();
        if (!location || !activeInput || !activeLatitude || !activeLongitude) {
            setStatus("Choose a location on the map before continuing.", true);
            return;
        }
        activeInput.value = selectedAddress || "Dropped map pin";
        activeLatitude.value = String(location.lat);
        activeLongitude.value = String(location.lng);
        const message = activeInput.form?.querySelector<HTMLElement>("[data-request-message]");
        if (message) {
            message.textContent = "";
            message.classList.remove("form-submit-error");
        }
        activeInput.dispatchEvent(new Event("change", { bubbles: true }));
        confirmedLocation = true;
        closeDialog();
    });

    for (const input of addressInputs) {
        const wrapper = input.closest<HTMLElement>(".maps-search-control");
        const openButton = wrapper?.querySelector<HTMLButtonElement>("[data-open-location-map]");
        const clearButton = wrapper?.querySelector<HTMLButtonElement>("[data-clear-location]");
        const latitude = input.form?.querySelector<HTMLInputElement>("[data-location-latitude]");
        const longitude = input.form?.querySelector<HTMLInputElement>("[data-location-longitude]");
        if (!wrapper || !openButton || !clearButton || !latitude || !longitude) {
            throw new Error(`The map location field "${input.id}" is missing its map controls or coordinate fields.`);
        }

        openButton.setAttribute("aria-controls", dialog.id);
        const updateClearButton = (): void => {
            clearButton.hidden = !input.value.trim();
        };
        input.addEventListener("input", () => {
            latitude.value = "";
            longitude.value = "";
            updateClearButton();
        });
        openButton.addEventListener("click", () => {
            activeInput = input;
            activeLatitude = latitude;
            activeLongitude = longitude;
            confirmedLocation = false;
            searchInput.value = input.value.trim();
            setStatus("Search for a location or click the map to place a pin.");
            resultsList.hidden = true;
            resultsList.replaceChildren();
            dialog.showModal();
            ensureMap();
            searchInput.focus();
        });
        clearButton.addEventListener("click", () => {
            input.value = "";
            latitude.value = "";
            longitude.value = "";
            updateClearButton();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.focus();
        });
        updateClearButton();
    }
}
