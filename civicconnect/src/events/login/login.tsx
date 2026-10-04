
//----------------------------------------------------------------------------
// Hashes the password using SHA-256 and returns the hash as a hexadecimal string
//----------------------------------------------------------------------------

async function hash_password(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    return hashHex;
}

