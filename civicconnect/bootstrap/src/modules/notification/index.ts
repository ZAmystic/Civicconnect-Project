// src/modules/notification/index.ts
// Notification Component (Component diagram, Figure 3).
// Observer-pattern subscriber (ADR-03) to Request Management's
// status-change events (FR-005). Delivers requester notifications via an
// external provider over REST - the one deliberate network boundary this
// module owns (A2 Task 3 recommendation: in-process event internally,
// REST only at the genuinely external edge).
//
// Must not be called synchronously from Request Management's write path;
// wire it as a subscriber so a slow/unavailable provider cannot block a
// status transition.

export {};
