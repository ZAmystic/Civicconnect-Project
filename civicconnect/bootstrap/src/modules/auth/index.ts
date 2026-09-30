// src/modules/auth/index.ts
// Auth / RBAC Component (Component diagram, Figure 3).
// Verifies identity and enforces role-scoped access server-side, per
// record, deny-by-default (NFR-004; A3 Q2 s2.2 Chains 1-2). Every other
// module's endpoints must run their request through this component's
// authorisation check before touching request data - it is the one place
// the "who is allowed to see this record" rule is implemented, so it is
// not duplicated (or forgotten) in each module individually.

export {};
