import nodemailer from "nodemailer";

export interface TicketChangeNotification {
    recipientEmail: string | null;
    trackingReference: string;
    changes: string[];
}

export async function sendTicketChangeNotification(
    notification: TicketChangeNotification
): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT);
    const from = process.env.SMTP_FROM?.trim();
    const username = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASS;

    if (!notification.recipientEmail?.trim()) {
        throw new Error("The ticket requester does not have an email address.");
    }
    if (!notification.changes.length) {
        throw new Error("A ticket notification requires at least one change.");
    }
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !from) {
        throw new Error("SMTP is not fully configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM.");
    }
    if ((username && !password) || (!username && password)) {
        throw new Error("SMTP_USER and SMTP_PASS must either both be set or both be empty.");
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE?.trim().toLowerCase() === "true" || port === 465,
        ...(username && password ? { auth: { user: username, pass: password } } : {}),
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000
    });
    const fromName = process.env.SMTP_FROM_NAME?.trim();

    await transporter.sendMail({
        from: fromName ? { name: fromName, address: from } : from,
        to: notification.recipientEmail.trim(),
        subject: `Update to service request ${notification.trackingReference}`,
        text: [
            `There has been an update to your CivicConnect service request ${notification.trackingReference}.`,
            "",
            ...notification.changes.map((change) => `- ${change}`),
            "",
            "Sign in to CivicConnect to view the latest details."
        ].join("\n")
    });
}
