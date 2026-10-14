interface User {
    user_id: number;
    full_name: string;
    full_surname: string | null;
    account_status: boolean | string;
    email: string;
    role: string;
}

interface UsersApiResponse {
    success: boolean;
    users: User[];
    total: number;
}

interface UserUpdateResponse {
    success: boolean;
    message?: string;
    user?: User;
}

let users: User[] = [];
let selectedUser: User | null = null;

function getAccountStatusLabel(status: boolean | string): "Active" | "Inactive" {
    return status === true ||
        ["active", "true"].includes(String(status).toLowerCase())
        ? "Active"
        : "Inactive";
}

function updateUserAnalytics(userList: User[]): void {
    const counts = userList.reduce(
        (totals, user) => {
            if (getAccountStatusLabel(user.account_status) === "Active") {
                totals.active += 1;
            }
            if (user.role === "Contractor") {
                totals.contractors += 1;
            }
            if (user.role === "Staff" || user.role === "Manager") {
                totals.staffAndManagers += 1;
            }
            return totals;
        },
        { active: 0, contractors: 0, staffAndManagers: 0 }
    );
    const metrics: Record<string, number> = {
        totalUserMetric: userList.length,
        activeUserMetric: counts.active,
        inactiveUserMetric: userList.length - counts.active,
        contractorUserMetric: counts.contractors,
        staffManagerUserMetric: counts.staffAndManagers
    };

    for (const [id, value] of Object.entries(metrics)) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = String(value);
        }
    }
}

const tableBody = document.getElementById(
    "usersTableBody"
) as HTMLTableSectionElement | null;

const userSearch = document.getElementById(
    "userSearch"
) as HTMLInputElement | null;

const refreshButton = document.getElementById(
    "refreshUsers"
) as HTMLButtonElement | null;

const userCount = document.getElementById(
    "userCount"
) as HTMLSpanElement | null;

const userDialog = document.getElementById(
    "userDetailsDialog"
) as HTMLDialogElement | null;
const userDetailsForm = document.getElementById(
    "userDetailsForm"
) as HTMLFormElement | null;
const userDialogId = document.getElementById(
    "userDialogId"
) as HTMLParagraphElement | null;
const userDialogMessage = document.getElementById(
    "userDialogMessage"
) as HTMLParagraphElement | null;
const editUserName = document.getElementById(
    "editUserName"
) as HTMLInputElement | null;
const editUserSurname = document.getElementById(
    "editUserSurname"
) as HTMLInputElement | null;
const editUserEmail = document.getElementById(
    "editUserEmail"
) as HTMLInputElement | null;
const editUserRole = document.getElementById(
    "editUserRole"
) as HTMLSelectElement | null;
const editUserStatus = document.getElementById(
    "editUserStatus"
) as HTMLSelectElement | null;
const saveUserEdit = document.getElementById(
    "saveUserEdit"
) as HTMLButtonElement | null;

function closeUserDialog(): void {
    userDialog?.close();
    selectedUser = null;
}

function openUserDialog(user: User): void {
    if (
        !userDialog ||
        !userDialogId ||
        !userDialogMessage ||
        !editUserName ||
        !editUserSurname ||
        !editUserEmail ||
        !editUserRole ||
        !editUserStatus
    ) {
        console.error("User details dialog is missing a required control.");
        return;
    }

    selectedUser = user;
    userDialogId.textContent = `User ID: ${user.user_id}`;
    userDialogMessage.textContent = "";
    editUserName.value = user.full_name;
    editUserSurname.value = user.full_surname ?? "";
    editUserEmail.value = user.email;
    editUserRole.value = user.role;
    editUserStatus.value = String(
        user.account_status === true ||
        String(user.account_status).toLowerCase() === "active" ||
        String(user.account_status).toLowerCase() === "true"
    );
    userDialog.showModal();
    editUserName.focus();
}


// Retrieve users from the backend
async function loadUsers(): Promise<void> {
    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = `
        <tr>
            <td colspan="6">Loading users...</td>
        </tr>
    `;

    try {
        const response = await fetch("/api/users");

        if (!response.ok) {
            const errorData: Partial<UsersApiResponse> & { message?: string } =
                await response.json();
            throw new Error(errorData.message || "Failed to retrieve users");
        }

        const data: UsersApiResponse = await response.json();

        if (!data.success || !Array.isArray(data.users)) {
            throw new Error("Invalid API response");
        }

        users = data.users;
        updateUserAnalytics(users);

        filterUsers();

    } catch (error) {
        console.error("Error loading users:", error);

        const errorRow = document.createElement("tr");
        const errorCell = document.createElement("td");
        errorCell.colSpan = 6;
        errorCell.textContent = error instanceof Error
            ? error.message
            : "Unable to load users.";
        errorRow.appendChild(errorCell);
        tableBody.replaceChildren(errorRow);

        if (userCount) {
            userCount.textContent = "0 users";
        }
        updateUserAnalytics([]);
    }
}


// Display users in the HTML table
function displayUsers(userList: User[]): void {
    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = "";

    if (userList.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6">No users found.</td>
            </tr>
        `;
    }

    userList.forEach((user: User) => {
        const status = getAccountStatusLabel(user.account_status);
        const row = document.createElement("tr");
        row.classList.add("user-row");
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `Edit user ${user.full_name}`);
        row.addEventListener("click", () => openUserDialog(user));
        row.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openUserDialog(user);
            }
        });

        const fields: Array<string | number> = [
            user.user_id,
            user.full_name,
            user.full_surname ?? "",
            status,
            user.email,
            user.role
        ];

        fields.forEach((value: string | number, index: number) => {
            const cell = document.createElement("td");

            if (index === 3) {
                const badge = document.createElement("span");
                badge.className = `user-status ${status.toLowerCase()}`;
                badge.textContent = status;
                cell.appendChild(badge);
            } else {
                cell.textContent = String(value ?? "");
            }

            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });

    if (userCount) {
        userCount.textContent = `${userList.length} users`;
    }
}


// Filter users based on search input
function filterUsers(): void {
    const search = userSearch?.value.toLowerCase().trim() ?? "";

    const filteredUsers = users.filter((user: User) => {
        const fields = [
            user.user_id,
            user.full_name,
            user.full_surname,
            getAccountStatusLabel(user.account_status),
            user.email,
            user.role
        ];

        return fields.some((value) =>
            String(value ?? "").toLowerCase().includes(search)
        );
    });

    displayUsers(filteredUsers);
}


// Search event
userSearch?.addEventListener("input", filterUsers);


// Refresh event
refreshButton?.addEventListener("click", () => {
    void loadUsers();
});

document.getElementById("closeUserDialog")?.addEventListener("click", closeUserDialog);
document.getElementById("cancelUserEdit")?.addEventListener("click", closeUserDialog);
userDialog?.addEventListener("click", (event: MouseEvent) => {
    if (event.target === userDialog) {
        closeUserDialog();
    }
});

userDetailsForm?.addEventListener("submit", async (event: SubmitEvent) => {
    event.preventDefault();
    if (
        !selectedUser ||
        !userDialogMessage ||
        !editUserName ||
        !editUserSurname ||
        !editUserEmail ||
        !editUserRole ||
        !editUserStatus ||
        !saveUserEdit
    ) {
        return;
    }

    userDialogMessage.textContent = "";
    saveUserEdit.disabled = true;

    try {
        const response = await fetch(`/api/users/${selectedUser.user_id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                full_name: editUserName.value.trim(),
                full_surname: editUserSurname.value.trim(),
                email: editUserEmail.value.trim(),
                role: editUserRole.value,
                account_status: editUserStatus.value === "true"
            })
        });
        const data: UserUpdateResponse = await response.json();

        if (!response.ok || !data.success || !data.user) {
            throw new Error(data.message || "Unable to save user changes.");
        }

        users = users.map((user) =>
            user.user_id === data.user?.user_id ? data.user : user
        );
        updateUserAnalytics(users);
        closeUserDialog();
        filterUsers();
    } catch (error) {
        console.error("Error saving user changes:", error);
        userDialogMessage.textContent = error instanceof Error
            ? error.message
            : "Unable to save user changes.";
    } finally {
        saveUserEdit.disabled = false;
    }
});

// Load users when page opens
void loadUsers();
