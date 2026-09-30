// src/config/env.ts
// Loads and validates configuration from environment variables only.
// Never hard-code secrets or environment-specific values here - see
// .env.example (Layer 2) and .gitignore (Layer 1), per A3 Q2 Chain 3
// (Secrets & Configuration) and Wiggins (2017) The Twelve-Factor App.

import * as dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
  sessionSecret: required("SESSION_SECRET"),
  sessionCookieSecure: (process.env.SESSION_COOKIE_SECURE ?? "true") === "true",
};

