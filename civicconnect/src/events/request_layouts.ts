export function initializeRequestLayouts(): void {
    for (const form of document.querySelectorAll<HTMLFormElement>("[data-request-layout-form]")) {
        const message = form.querySelector<HTMLElement>("[data-request-message]");
        const submitButton = form.querySelector<HTMLButtonElement>("[type='submit']");

        if (!message || !submitButton) {
            throw new Error("A request layout form is missing its status message or submit button.");
        }

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
        }

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            message.textContent =
                "This form is a layout preview only; submitting it does not save or send a request yet.";
            message.classList.add("form-submit-error");
        });

        form.addEventListener("input", () => {
            message.textContent = "";
            message.classList.remove("form-submit-error");
        });
        form.addEventListener("change", () => {
            message.textContent = "";
            message.classList.remove("form-submit-error");
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
