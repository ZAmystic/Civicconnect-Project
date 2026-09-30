# CivicConnect API - Repository Bootstrap (M2, Sub-Task 1.5)

Initial runnable application shell for the CivicConnect API Application
container (ADR-02: Node.js + TypeScript + Express + PostgreSQL), organised
as a **Modular Monolith** (ADR-01) with module boundaries matching the
Component diagram (Figure 3 of the M2 Architecture contribution).

## Folder structure

```
/src
  /config          Environment/config loading (env.ts) and the shared
                    PostgreSQL pool (db.ts) - 12-Factor config, no secrets
                    in source (A3 Q2 Chain 3).
  /modules         One folder per bounded module from the Component
                    diagram: request-management, notification, audit,
                    auth, contractor-adapter. Each currently holds a
                    boundary-defining stub for its owning member to
                    implement against.
  /routes          Cross-cutting routes not owned by a single module
                    (currently: health.route.ts - liveness/readiness).
  app.ts           Express app assembly (middleware + route mounting).
  server.ts        Process entry point (imports app.ts, binds the port).
/tests             Jest + supertest tests.
/docs              Reserved for diagrams/specs referenced from the PED
                    (e.g. Member 3's openapi.yaml).
.env.example        Configuration blueprint (Layer 2) - copy to .env,
                    never commit the real .env (Layer 1, see .gitignore).
```

## Getting started (once dependencies are installed by a member with npm access)

```bash
cp .env.example .env    # then fill in real local values
npm install
npm run dev              # starts the API with ts-node-dev
npm test                 # runs the Jest test suite
```

## Ownership per the M2 Workload Distribution Plan

- **Member 1 (Architecture & Tech Lead):** repository structure, `.env.example`,
  environment config, core app shell (this bootstrap).
- **Member 2 (Data & Persistence Lead):** database migration scripts, seed
  data, and the persistence-layer implementation inside
  `src/modules/request-management` and `src/modules/audit`, built on
  `src/config/db.ts`.
- **Member 3 (UI, APIs & Admin Lead):** Express REST controllers/routes,
  authentication middleware (`src/modules/auth`), and the contractor mock
  adapter (`src/modules/contractor-adapter`).

All substantive changes go through a feature branch and a Pull Request
requiring both other members' approval (two-reviewer rule) - see the
Master Project Brief section 9 and the M1 GitHub Governance section.
