interface RequestSubmissionResponse {
    success: boolean;
    message?: string;
    trackingReference?: string;
}

function parseSubmissionResponse(value: unknown): RequestSubmissionResponse | null {
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
        trackingReference: typeof ticket.tracking_ref === "string" ? ticket.tracking_ref : undefined
    };
}

function serializeForm(form: HTMLFormElement): Record<string, string | string[] | boolean> {
    const details: Record<string, string | string[] | boolean> = {};
    for (const [name, value] of new FormData(form)) {
        if (typeof value !== "string") {
            continue;
        }
        const existing = details[name];
        if (existing === undefined) {
            details[name] = value;
        } else if (Array.isArray(existing)) {
            existing.push(value);
        } else if (typeof existing === "string") {
            details[name] = [existing, value];
        } else {
            throw new Error(`The form contains incompatible values for "${name}".`);
        }
    }

    for (const checkbox of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]')) {
        if (checkbox.getAttribute("role") === "switch") {
            details[checkbox.name] = checkbox.checked;
        }
    }
    return details;
}

export function initializeRequestLayouts(): void {
    for (const form of document.querySelectorAll<HTMLFormElement>("[data-request-layout-form]")) {
        const message = form.querySelector<HTMLElement>("[data-request-message]");
        const submitButton = form.querySelector<HTMLButtonElement>("[type='submit']");
        const requestType = form.dataset.requestType;

        if (!message || !submitButton || !requestType) {
            throw new Error("A request form is missing its status message, submit button, or request type.");
        }

        let isSubmitting = false;
        for (const group of form.querySelectorAll<HTMLElement>("[data-check-at-least-one]")) {
            const checkboxes = Array.from(
                group.querySelectorAll<HTMLInputElement>("input[type='checkbox']")
            );
            const requiredCheckbox = checkboxes[0];
            if (!requiredCheckbox) {
                throw new Error("A required checkbox group does not contain any checkboxes.");
            }
            const updateRequiredState = (): void => {
                requiredCheckbox.required = !checkboxes.some((checkbox) => checkbox.checked);
            };
            group.addEventListener("change", updateRequiredState);
            form.addEventListener("reset", () => {
                window.setTimeout(() => {
                    requiredCheckbox.required = true;
                });
            });
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (isSubmitting) {
                return;
            }

            isSubmitting = true;
            submitButton.disabled = true;
            submitButton.setAttribute("aria-busy", "true");
            message.textContent = "Submitting your request…";
            message.classList.remove("form-submit-error", "form-submit-success");

            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 30000);
            try {
                const response = await fetch("/api/requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: controller.signal,
                    body: JSON.stringify({
                        requestType,
                        details: serializeForm(form)
                    })
                });
                const result = parseSubmissionResponse(await response.json());
                if (!result) {
                    throw new Error("The server returned an invalid service request response.");
                }
                if (!response.ok || !result.success) {
                    message.textContent = result.message || "The request could not be submitted. Please try again.";
                    message.classList.add("form-submit-error");
                    return;
                }

                form.reset();
                for (const input of form.querySelectorAll<HTMLInputElement>("[data-map-location]")) {
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                }
                message.textContent = result.trackingReference
                    ? `Request submitted. Tracking reference: ${result.trackingReference}`
                    : "Request submitted.";
                message.classList.add("form-submit-success");
            } catch (error) {
                console.error("Service request submission failed.", error);
                message.textContent = error instanceof DOMException && error.name === "AbortError"
                    ? "The submission timed out. Your details are still here; check your connection and try again."
                    : "The request could not be submitted because the server could not be reached. Your details are still here; please try again.";
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
            message.classList.remove("form-submit-error", "form-submit-success");
        });
        form.addEventListener("change", () => {
            if (isSubmitting) {
                return;
            }
            message.textContent = "";
            message.classList.remove("form-submit-error", "form-submit-success");
        });
    }

    const immediateThreat = document.getElementById(
        "immediateThreat"
    ) as HTMLInputElement | null;
    const emergencyDialog = document.getElementById(
        "emergencyWarningDialog"
    ) as HTMLDialogElement | null;
    const acknowledgeEmergencyWarning = document.getElementById(
        "acknowledgeEmergencyWarning"
    ) as HTMLButtonElement | null;

    if (immediateThreat && emergencyDialog && acknowledgeEmergencyWarning) {
        immediateThreat.addEventListener("change", () => {
            if (immediateThreat.checked && !emergencyDialog.open) {
                emergencyDialog.showModal();
            }
        });
        acknowledgeEmergencyWarning.addEventListener("click", () => emergencyDialog.close());
        emergencyDialog.addEventListener("close", () => {
            if (!immediateThreat.checked) {
                immediateThreat.focus();
            }
        });
    }
}
