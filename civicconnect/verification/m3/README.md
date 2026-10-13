# CivicConnect M3 verification

This verification area is intentionally separate from application source. It verifies the behavior described by the M3 rubric and the existing CivicConnect request/navigation contracts. It does not claim feature completeness against an approved M3 requirements catalogue that is not present here.

## Run

From `civicconnect/`:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run test:performance
```

The PR workflow runs the unit, black-box, and API suites, then runs the Playwright system cases in Chromium. The build's `tsc` step is the static type-analysis check; CI also runs `npm audit` and Gitleaks. CI test results and the Playwright HTML report are uploaded as workflow artifacts. The performance scenario reports its measured local route latency in the test log.

## Test evidence records

All inputs are synthetic and use an in-process test server with a controlled database client. The API integration suite exercises the real Express request router and ticket creation code but **does not connect to PostgreSQL**. The browser suite uses the built Vite application and mocks only the current-user and request-submission HTTP responses. These limitations are part of the interpretation, not claims of production database or cloud validation.

| ID | Basis / purpose / design | Controlled input and expected result | Actual result and interpretation |
|---|---|---|---|
| UT-01 | Request tracking-reference contract; verify fallback sequence and category prefix. | Prior number `1005`; expect `TCK-D-<UTC year>-1006`. | **Pass locally (2026-10-13).** Demonstrates the allocator format/fallback, not database sequence correctness. |
| UT-02 | Shared year-wide counter across request categories. | Prior number `2048`, next type Maintenance; expect `TCK-M-<UTC year>-2049`. | **Pass locally (2026-10-13).** Demonstrates category-independent sequence use at helper level. |
| UT-03 | Reference formatting boundary. | Prior number `9999`; expect `10000` without truncation. | **Pass locally (2026-10-13).** Demonstrates increment formatting beyond four digits. |
| UT-04 | Concurrent allocation risk and transaction rule. | Observe calls for yearly advisory lock, maximum read, and ticket insert; require that order. | **Pass locally (2026-10-13).** Demonstrates call ordering, not concurrent behavior on a real PostgreSQL server. |
| UT-05 | Category creation failure must not create an orphan ticket. | Category lookup returns no row; expect a clear rejection and no ticket insert. | **Pass locally (2026-10-13).** Demonstrates failure handling at the ticket helper boundary. |
| BF-01 | Authentication requirement; unauthorized behavior. | No session user; expect HTTP 401 and no DB acquisition. | **Pass locally (2026-10-13).** Demonstrates unauthenticated requests are rejected before persistence. |
| BF-02 | Input equivalence partitions and unknown-field policy. | Unknown request type, blank required location, and unexpected field; each expects HTTP 400 and no DB calls. | **Pass locally (2026-10-13).** Demonstrates invalid request classes are rejected. |
| BF-03 | Boundary-value analysis for optional asset ID length. | 80 characters expected accepted; 81 expected rejected with HTTP 400. | **Pass locally (2026-10-13).** Demonstrates exact server-side length boundary enforcement. |
| BF-04 | Boundary-value analysis for geographic coordinates and paired map values. | `-90, 180` expected accepted; latitude above 90 and one missing coordinate each expected HTTP 400. | **Pass locally (2026-10-13).** Demonstrates coordinate bounds and pair validation. |
| BF-05 | Date validation failure path for lost property. | Non-date timestamp; expect HTTP 400 before any DB call. | **Pass locally (2026-10-13).** Demonstrates malformed date input is blocked before transaction work. |
| API-01 | Request API contract and typed damaged-equipment persistence. | Submit all required fields, selected map coordinates, and two damage selections; expect HTTP 201, semicolon serialization, tracking reference, commit, and client release. | **Pass locally (2026-10-13).** Demonstrates router-to-ticket-helper-to-detail-insert orchestration using a database double. |
| API-02 | General-request mapping business rule. | Topic, department, urgency, and details; expect combined ticket description and typed detail insert, then commit. | **Pass locally (2026-10-13).** Demonstrates consistency between submitted data and both insert contracts using a database double. |
| API-03 | Persistence failure must be atomic. | Force typed-details insert error; expect HTTP 500, rollback, no commit, and client release. | **Pass locally (2026-10-13).** Demonstrates transaction cleanup on downstream failure using a database double; the logged constraint error is deliberately simulated. |
| API-04 | Account authorization business rule. | Authenticated user has inactive status; expect HTTP 401, rollback, no ticket insert, and client release. | **Pass locally (2026-10-13).** Demonstrates disabled accounts cannot submit through this endpoint. |
| E2E-01 | Dashboard navigation requirement: Create Ticket belongs to Dashboards; service shortcuts belong to Service Requests. | Load dashboard with a requester fixture; expect active account name, service shortcut, and navigation to Services from Create Ticket. | **Pass locally in Chromium (2026-10-13).** Demonstrates a browser-visible navigation path on the built application; current-user API is mocked. |
| E2E-02 | Critical requester journey from dashboard through form submission. | Navigate to Damaged Equipment, submit controlled valid fields, mock successful API response; expect tracking reference and form reset. | **Pass locally in Chromium (2026-10-13).** Demonstrates browser form serialization/feedback and page flow; database persistence is covered separately with a mock. |
| PERF-01 | Request submission is a user-facing operation; a bounded burst detects gross synchronous/validation regressions. | 30 concurrent valid submissions to the in-process route; require 30 successful responses/commits and report total elapsed time, mean latency, p50, and p95. | **Pass locally (2026-10-13):** 30/30; total 97.4 ms; mean 70.2 ms; p50 69.4 ms; p95 70.1 ms. This isolates app/router overhead with a database double and is not a production latency SLO. |

The functional and API cases include negative/unauthorized behavior (BF-01, BF-02, BF-03, BF-04, BF-05, API-03, API-04) and cover high-priority authentication, data integrity, validation, and tracking-reference risks. Equivalence partitioning is used in BF-02; boundary-value analysis is used in BF-03 and BF-04. API-01 is also a functional success case, so the rubric's legitimate overlap is explicit rather than double-counted as a separate test.

## Evidence interpretation and remaining validation

- The Vitest and Playwright results prove behavior only for the tested code and controlled local fixtures; passing tests do not prove all request types, production Supabase/PostgreSQL behavior, or operational readiness.
- The Playwright tests run on the built dashboard and request page. Their API responses are intercepted; successful UI feedback is not evidence of a real database write.
- The integration suite verifies transaction boundaries and SQL parameters against a test double. A separate staging/UAT run against the configured test database is still required.
- Performance numbers are diagnostic route measurements on the test runner. Compare repeat runs on a stable environment before treating changes as a performance regression; no arbitrary application SLA is inferred here.
- The CI workflow is the execution evidence and quality gate. A failed build or test fails the workflow; review the run and uploaded reports before accepting a release candidate.
