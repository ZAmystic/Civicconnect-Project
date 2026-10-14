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

interface FacilityFaultSubmissionResponse {
    success: boolean;
    message?: string;
    trackingReference?: string;
}

let lastGeocodingRequestAt = 0;
let geocodingQueue = Promise.resolve();

function parseSubmissionResponse(value: unknown): FacilityFaultSubmissionResponse | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }
    const response = value as Record<string, unknown>;
    if (typeof response.success !== "boolean") {
        return null;
    }

    const message = typeof response.message === "string" ? response.message : undefined;
    if (typeof response.ticket !== "object" || response.ticket === null || Array.isArray(response.ticket)) {
        return { success: response.success, message };
    }

    const ticket = response.ticket as Record<string, unknown>;
    return {
        success: response.success,
        message,
        trackingReference: typeof ticket.tracking_ref === "string" ? ticket.tracking_ref : undefined,
    };
}

async function queryNominatim<T>(url: string): Promise<T> {
    let resolveRequest: (value: T) => void;
    let rejectRequest: (reason?: unknown) => void;
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
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
            });
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

function createGeocodingUrl(path: "search" | "reverse", parameters: URLSearchParams): string {
    return `https://nominatim.openstreetmap.org/${path}?${parameters.toString()}`;
}

export async function initializeFacilityFaultForm(): Promise<void> {
    const form = document.getElementById("facilityFaultForm") as HTMLFormElement | null;
    const submitButton = document.querySelector<HTMLButtonElement>(
        "#facilityFaultForm .submit-request-button"
    );
    const addressInput = document.getElementById("facilityAddress") as HTMLInputElement | null;
    const latitudeInput = document.getElementById("facilityLatitude") as HTMLInputElement | null;
    const longitudeInput = document.getElementById("facilityLongitude") as HTMLInputElement | null;
    const message = document.getElementById("facilityFaultMessage");
    const dialog = document.getElementById("facilityLocationDialog") as HTMLDialogElement | null;
    const openMapButton = document.getElementById("openFacilityMap") as HTMLButtonElement | null;
    const clearLocationButton = document.getElementById("clearFacilityLocation") as HTMLButtonElement | null;
    const closeMapButton = document.getElementById("closeFacilityMap") as HTMLButtonElement | null;
    const cancelLocationButton = document.getElementById("cancelFacilityLocation") as HTMLButtonElement | null;
    const confirmLocationButton = document.getElementById("confirmFacilityLocation") as HTMLButtonElement | null;
    const searchForm = document.getElementById("facilityLocationSearchForm") as HTMLFormElement | null;
    const searchInput = document.getElementById("facilityLocationSearch") as HTMLInputElement | null;
    const searchButton = document.getElementById("searchFacilityLocation") as HTMLButtonElement | null;
    const status = document.getElementById("facilityLocationStatus");
    const resultsList = document.getElementById("facilityLocationResults");
    const mapElement = document.getElementById("facilityMap");
    const coordinatesOutput = document.getElementById("facilityLocationCoordinates");

    if (
        !form || !submitButton || !addressInput || !latitudeInput || !longitudeInput || !message || !dialog ||
        !openMapButton || !clearLocationButton || !closeMapButton || !cancelLocationButton || !confirmLocationButton ||
        !searchForm || !searchInput || !searchButton || !status || !resultsList || !mapElement ||
        !coordinatesOutput
    ) {
        throw new Error("The facility fault location picker is missing required page elements.");
    }

    let map: L.Map | undefined;
    let marker: L.Marker | undefined;
    let selectedAddress = "";
    let selectionVersion = 0;
    let searchVersion = 0;
    let confirmedLocation = false;
    let isSubmitting = false;

    const updateClearButton = (): void => {
        clearLocationButton.hidden = !addressInput.value.trim();
    };

    const updateCoordinates = (location: L.LatLng | undefined): void => {
        coordinatesOutput.textContent = location
            ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : "No pin selected";
        confirmLocationButton.disabled = !location;
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
                const movedTo = marker?.getLatLng();
                if (movedTo) {
                    void resolvePinAddress(movedTo);
                }
            });
        } else {
            marker.setLatLng(location);
        }

        updateCoordinates(location);
    };

    const setStatus = (text: string, isError = false): void => {
        status.textContent = text;
        status.classList.toggle("is-error", isError);
    };

    const resolvePinAddress = async (location: L.LatLng): Promise<void> => {
        setMarker(location);
        confirmLocationButton.disabled = true;
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
                createGeocodingUrl("reverse", parameters)
            );
            if (requestVersion !== selectionVersion) {
                return;
            }
            selectedAddress = result.display_name || "Dropped map pin";
            confirmLocationButton.disabled = false;
            setStatus("Pin placed. Drag it to adjust the facility location.");
        } catch (error) {
            console.error("Unable to look up the selected map location.", error);
            if (requestVersion === selectionVersion) {
                selectedAddress = "Dropped map pin";
                confirmLocationButton.disabled = false;
                setStatus("The pin is set, but its address could not be looked up. You can still use this location.", true);
            }
        }
    };

    const restoreCommittedLocation = (): void => {
        const latitude = Number(latitudeInput.value);
        const longitude = Number(longitudeInput.value);
        if (!latitudeInput.value || !longitudeInput.value || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            marker?.remove();
            marker = undefined;
            selectedAddress = "";
            selectionVersion += 1;
            updateCoordinates(undefined);
            return;
        }

        const location = L.latLng(latitude, longitude);
        setMarker(location, addressInput.value);
        map?.setView(location, 17);
    };

    const ensureMap = (): void => {
        if (!map) {
            map = L.map(mapElement, { zoomControl: true }).setView([0, 0], 2);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
            }).addTo(map);
            map.on("click", (event: L.LeafletMouseEvent) => {
                void resolvePinAddress(event.latlng);
            });
        }

        restoreCommittedLocation();
        window.setTimeout(() => map?.invalidateSize(), 100);
    };

    const closePicker = (): void => {
        dialog.close();
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
                selectedAddress = result.display_name;
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
                createGeocodingUrl("search", parameters)
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

    openMapButton.addEventListener("click", () => {
        confirmedLocation = false;
        searchInput.value = addressInput.value.trim();
        dialog.showModal();
        ensureMap();
        searchInput.focus();
    });

    clearLocationButton.addEventListener("click", () => {
        addressInput.value = "";
        latitudeInput.value = "";
        longitudeInput.value = "";
        selectedAddress = "";
        selectionVersion += 1;
        marker?.remove();
        marker = undefined;
        searchInput.value = "";
        resultsList.replaceChildren();
        resultsList.hidden = true;
        updateCoordinates(undefined);
        updateClearButton();
        addressInput.dispatchEvent(new Event("input", { bubbles: true }));
        openMapButton.focus();
    });

    closeMapButton.addEventListener("click", closePicker);
    cancelLocationButton.addEventListener("click", closePicker);
    dialog.addEventListener("close", () => {
        if (!confirmedLocation) {
            restoreCommittedLocation();
        }
        confirmedLocation = false;
    });

    confirmLocationButton.addEventListener("click", () => {
        const location = marker?.getLatLng();
        if (!location) {
            setStatus("Choose a location on the map before continuing.", true);
            return;
        }

        addressInput.value = selectedAddress || "Dropped map pin";
        latitudeInput.value = String(location.lat);
        longitudeInput.value = String(location.lng);
        updateClearButton();
        message.textContent = "";
        message.classList.remove("form-submit-error");
        confirmedLocation = true;
        closePicker();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (isSubmitting) {
            return;
        }
        if (!addressInput.value.trim()) {
            message.textContent = "Enter the facility address or choose it on the map before submitting.";
            message.classList.add("form-submit-error");
            addressInput.focus();
            return;
        }

        const classification = form.querySelector<HTMLInputElement>(
            'input[name="faultClassification"]:checked'
        )?.value;
        const urgency = form.querySelector<HTMLInputElement>(
            'input[name="urgency"]:checked'
        )?.value;
        const incidentDescription = form.querySelector<HTMLTextAreaElement>(
            "#incidentDescription"
        )?.value.trim();
        if (!classification || !urgency || !incidentDescription) {
            message.textContent = "Complete the fault classification, urgency, and incident description.";
            message.classList.add("form-submit-error");
            return;
        }

        const hasLatitude = latitudeInput.value !== "";
        const hasLongitude = longitudeInput.value !== "";
        if (hasLatitude !== hasLongitude) {
            message.textContent = "The selected map location is incomplete. Choose the location on the map again.";
            message.classList.add("form-submit-error");
            return;
        }

        isSubmitting = true;
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        message.textContent = "Submitting your facility report…";
        message.classList.remove("form-submit-error");
        message.classList.remove("form-submit-success");

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch("/api/facility-faults", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    facilityAddress: addressInput.value.trim(),
                    latitude: hasLatitude ? Number(latitudeInput.value) : null,
                    longitude: hasLongitude ? Number(longitudeInput.value) : null,
                    faultClassification: classification,
                    urgency,
                    incidentDescription,
                }),
            });
            const payload: unknown = await response.json();
            const result = parseSubmissionResponse(payload);
            if (!result) {
                throw new Error("The server returned an invalid facility report response.");
            }
            if (!response.ok || !result.success) {
                message.textContent = result.message || "The report could not be submitted. Please try again.";
                message.classList.add("form-submit-error");
                return;
            }

            const successMessage = result.trackingReference
                ? `Facility report submitted. Tracking reference: ${result.trackingReference}`
                : "Facility report submitted.";

            form.reset();
            latitudeInput.value = "";
            longitudeInput.value = "";
            selectedAddress = "";
            selectionVersion += 1;
            marker?.remove();
            marker = undefined;
            searchInput.value = "";
            resultsList.replaceChildren();
            resultsList.hidden = true;
            updateCoordinates(undefined);
            updateClearButton();

            message.textContent = successMessage;
            message.classList.remove("form-submit-error");
            message.classList.add("form-submit-success");
        } catch (error) {
            console.error("Facility report submission failed.", error);
            message.textContent = error instanceof DOMException && error.name === "AbortError"
                ? "The submission timed out. Your details are still here; check your connection and try again."
                : "The report could not be submitted because the server could not be reached. Your details are still here; please try again.";
            message.classList.add("form-submit-error");
        } finally {
            window.clearTimeout(timeoutId);
            isSubmitting = false;
            submitButton.disabled = false;
            submitButton.removeAttribute("aria-busy");
        }
    });

    form.addEventListener("input", () => {
        if (isSubmitting) {
            return;
        }
        message.textContent = "";
        message.classList.remove("form-submit-error");
        message.classList.remove("form-submit-success");
    });

    addressInput.addEventListener("input", () => {
        latitudeInput.value = "";
        longitudeInput.value = "";
        selectedAddress = "";
        selectionVersion += 1;
        marker?.remove();
        marker = undefined;
        updateCoordinates(undefined);
        updateClearButton();
    });

    updateClearButton();
}
