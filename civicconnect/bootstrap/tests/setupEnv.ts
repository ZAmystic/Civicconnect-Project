// tests/setupEnv.ts
// Provides dummy required environment variables for the test run only -
// never real credentials. Confirms env.ts's required() validation runs,
// without needing a real database for tests that don't touch it.

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/civicconnect_test";
process.env.SESSION_SECRET = "test-only-secret-not-for-real-use";
