import { dbPool } from "../../config/database";

export interface User {
    user_id: number;
    full_name: string;
    full_surname?: string;
    account_status: boolean | string;
    email: string;
    role: string;
    password_hash: string;
}

export interface UserTableSchema {
    hasSurname: boolean;
    accountStatusIsBoolean: boolean;
    passwordColumn: "password" | "password_hash";
}

export async function getUserTableSchema(): Promise<UserTableSchema> {
    const result = await dbPool.query<{ column_name: string; data_type: string }>(
        `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'User'
        `
    );
    const columns = new Map(result.rows.map((row) => [row.column_name, row.data_type]));
    const passwordColumn = columns.has("password_hash")
        ? "password_hash"
        : columns.has("password")
            ? "password"
            : null;

    if (
        !columns.has("full_name") ||
        !columns.has("email") ||
        !columns.has("account_status") ||
        !passwordColumn
    ) {
        throw new Error('The "User" table does not have a supported authentication schema.');
    }

    return {
        hasSurname: columns.has("full_surname"),
        accountStatusIsBoolean: columns.get("account_status") === "boolean",
        passwordColumn
    };
}
