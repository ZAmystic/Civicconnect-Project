# CivicConnect — GitHub Governance & Development Workflow

## 1. Purpose

The CivicConnect GitHub repository is governed through a controlled, task-based development workflow designed to ensure that all development activities are:

- **Clearly defined**
- **Traceable** to an approved requirement
- **Assigned** to an appropriate team member
- **Developed** in isolation
- **Reviewed** independently
- **Tested** before deployment
- **Properly documented**
- **Traceable** from the original requirement through to completion

The governance process ensures that implemented functionality remains aligned with the approved business requirements, system expectations, and required quality standards.

---

## 2. Development Workflow

All CivicConnect development tasks follow the lifecycle below:

```text
┌─────────────────────┐
│  Backlog /          │
│  Initiation         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Requirements       │
│  Planning           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Design             │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Development        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  UAT / Review &     │
│  Testing            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Deployment         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Completed Task     │
└─────────────────────┘
```

Each task must progress through the appropriate stages before it can be considered complete.

---

## 3. GitHub Task Management

### 3.1 GitHub Issues

Every feature, improvement, defect, or significant change must be represented by a **GitHub Issue**.

Issues provide a single source of truth for development work and establish traceability between:

$$	ext{Requirement} \longrightarrow 	ext{GitHub Issue} \longrightarrow 	ext{Git Branch} \longrightarrow 	ext{Commits} \longrightarrow 	ext{Pull Request} \longrightarrow 	ext{Code Review} \longrightarrow 	ext{UAT / Testing} \longrightarrow 	ext{Deployment} \longrightarrow 	ext{Completed Task}$$

Each Issue should clearly define:
* **Task title**
* **Description**
* **Business or system requirement**
* **Expected behaviour**
* **Acceptance criteria**
* **Assigned developer**
* **Priority**
* **Relevant labels**
* **Testing requirements**
* **UAT requirements** (where applicable)

> **Note:** No significant development work should be performed without an associated Issue.

---

## 4. GitHub Projects

GitHub Projects are used to organise and monitor Issues throughout the development lifecycle.

The project board provides visibility of the current state of each task and allows the team to monitor work as it progresses through the development process.

### Recommended Workflow States

| Status | Purpose |
| :--- | :--- |
| **Backlog / Initiation** | New tasks, ideas, defects, or requested functionality |
| **Requirements Planning** | Requirements, acceptance criteria, and scope are being defined |
| **Design** | Technical and system design is being completed |
| **Development** | Implementation is actively being performed |
| **UAT / Review & Testing** | Implementation is being reviewed and tested |
| **Deployment** | Approved changes are being prepared or deployed |
| **Completed Task** | Task has successfully passed all required stages |

The Project board should accurately reflect the current state of each Issue.

---

## 5. Branching Strategy

Each feature, defect, or change must be developed using its own Git branch. Branches must be associated with their corresponding GitHub Issue to maintain traceability.

```text
Issue #42 — Implement service request tracking
             │
             ▼
feature/42-service-request-tracking
             │
             ▼
Development
             │
             ▼
UAT-DEMO
             │
             ▼
Main
```

### Recommended Branch Naming
* `feature/<issue-number>-<short-description>`
* `bug/<issue-number>-<short-description>`
* `fix/<issue-number>-<short-description>`

#### Examples
* `feature/42-service-request-tracking`
* `feature/51-user-dashboard`
* `bug/64-request-status-error`
* `fix/71-login-validation`

Branch names should be short, descriptive, and directly traceable to their GitHub Issue.

---

## 6. Protected Branches

The repository uses two primary branches:
1. `UAT-DEMO`
2. `Main`

These branches serve different purposes within the development lifecycle.

### 6.1 UAT-DEMO

`UAT-DEMO` provides a controlled environment where completed development work can be integrated and tested before being introduced into the primary branch.

The purpose of this branch is to:
* Integrate completed development work
* Perform system-level testing
* Perform User Acceptance Testing (UAT)
* Identify integration problems
* Validate functionality against requirements
* Confirm that changes do not negatively affect existing functionality

Development branches should not bypass the `UAT-DEMO` stage when UAT is required.

### 6.2 Main

`Main` represents the approved and stable version of the CivicConnect system.

> **Crucial Rule:** Changes must **not** be pushed directly into `Main`.

All changes entering `Main` must have completed the required:
- [x] Development
- [x] Review
- [x] Testing
- [x] UAT (where applicable)
- [x] Approval

This protects the primary branch from untested or incomplete functionality.

---

## 7. Pull Requests

Once development has been completed, the developer must create a Pull Request (PR).

The Pull Request must:
* Reference the original GitHub Issue
* Explain what was changed
* Explain why the change was required
* Identify relevant testing performed
* Identify any known limitations
* Confirm that the implementation meets the acceptance criteria

### Example Pull Request Description

```markdown
Closes #42

Implemented service request tracking functionality.

Changes:
- Added request status tracking
- Added request history
- Added status update functionality
- Added validation for request states

Testing:
- Unit tests completed
- Integration testing completed
- UAT completed
```

---

## 8. Independent Code Review

A developer **must not** be the sole person responsible for approving their own implementation.

Once development is complete, a different team member must independently review the implementation.

### Reviewer Checklist
- [ ] The implementation satisfies the Issue requirements
- [ ] The acceptance criteria have been met
- [ ] Code quality is acceptable
- [ ] The implementation follows project standards
- [ ] No obvious security problems have been introduced
- [ ] Existing functionality has not been unnecessarily affected
- [ ] Appropriate tests have been performed
- [ ] The implementation is suitable for UAT/deployment

The reviewer must record their approval through the GitHub Pull Request review system.

---

## 9. UAT and Testing

Where UAT is required, the completed implementation must be tested against the approved requirements and acceptance criteria.

### Verification Criteria
UAT should confirm that:
* The required functionality is present
* The functionality behaves as specified
* User workflows operate correctly
* Existing functionality remains operational
* Validation and error handling work correctly
* The implementation satisfies the original business requirement

UAT results must be recorded against the relevant GitHub Issue or Pull Request.

### UAT Outcomes

```text
UAT Required
     │
     ├── UAT Passed ──► Deployment
     │
     └── UAT Failed ──► Development / Fix
```

If UAT fails, the task must return to the appropriate development stage before being considered complete.

---

## 10. GitHub Labels

GitHub Issues use standardised labels to identify the purpose and current state of work.

| Label | Purpose |
| :--- | :--- |
| `Feature` | New system functionality |
| `Bug` | Defect or incorrect behaviour |
| `Enhancement` | Improvement to existing functionality |
| `UAT Required` | Task requires User Acceptance Testing |
| `UAT Passed` | Task successfully passed UAT |
| `UAT Failed` | Task failed UAT and requires further work |
| `Documentation` | Documentation-related change |
| `Security` | Security-related task |
| `Priority: High` | High-priority work |
| `Priority: Medium` | Medium-priority work |
| `Priority: Low` | Low-priority work |

Labels should be applied consistently so that tasks can be filtered and identified easily.

---

## 11. Commit Governance

Commits should clearly describe the change that has been made.

Commits should:
* Be related to a specific Issue
* Contain a clear and meaningful message
* Represent a logical unit of work
* Avoid unrelated changes
* Avoid committing temporary or unnecessary files

### Recommended Format
```text
#<issue-number> - <description>
```

#### Examples
```text
#42 - Add service request status tracking
#42 - Add request history validation
#42 - Add tests for request status changes
```

This allows the repository history to remain traceable to the original development task.

---

## 12. Traceability

A key objective of the CivicConnect GitHub governance process is maintaining complete traceability.

Each development task should be traceable through the following chain:

```text
Business Requirement
        ↓
GitHub Issue
        ↓
GitHub Project
        ↓
Development Branch
        ↓
Commits
        ↓
Pull Request
        ↓
Independent Review
        ↓
UAT / Testing
        ↓
Deployment
        ↓
Completed Task
```

This provides an auditable record of:
* What was requested
* Why it was requested
* Who implemented it
* What code was changed
* Who reviewed it
* What testing was performed
* Who performed UAT
* Whether UAT passed or failed
* When the change was approved
* When the change was deployed

---

## 13. Defect Management

All identified defects must be recorded as GitHub Issues rather than being handled informally.

### Defect Issue Requirements
A defect Issue should contain:
* Description of the problem
* Steps to reproduce
* Expected behaviour
* Actual behaviour
* Severity/priority
* Relevant screenshots or logs where appropriate
* Assigned developer
* Testing requirements

### Defect Workflow

```text
Bug Identified
      ↓
Bug Issue Created
      ↓
Development Branch
      ↓
Fix Implemented
      ↓
Code Review
      ↓
UAT / Testing
      ↓
Deployment
      ↓
Bug Closed
```

---

## 14. Definition of Done

A task may only be marked as **Completed** when all applicable requirements have been satisfied.

### Definition of Done Checklist
- [ ] GitHub Issue exists
- [ ] Requirements are clearly defined
- [ ] Acceptance criteria are established
- [ ] Task is assigned to a team member
- [ ] Appropriate Git branch has been created
- [ ] Implementation has been completed
- [ ] Commits are traceable to the Issue
- [ ] Pull Request has been created
- [ ] Independent code review has been completed
- [ ] Required testing has been completed
- [ ] UAT has passed where applicable
- [ ] Changes have been integrated into `UAT-DEMO`
- [ ] Changes have been approved for `Main`
- [ ] Changes have been deployed
- [ ] GitHub Issue has been updated/closed
- [ ] GitHub Project status has been updated to **Completed Task**

---

## 15. Governance Principles

The CivicConnect development process follows these core governance principles:

1. **Traceability:** Every significant change must be traceable back to an approved requirement or development task.
2. **Controlled Development:** Development is performed within dedicated branches rather than directly on protected branches.
3. **Independent Review:** The developer responsible for implementing a change must not be the sole person responsible for approving it.
4. **Testing Before Deployment:** Changes must undergo the appropriate review and testing before being introduced into the primary branch.
5. **Controlled Integration:** `UAT-DEMO` acts as the controlled integration and validation stage before changes are introduced into `Main`.
6. **Auditability:** Issues, commits, Pull Requests, reviews, testing results, and approvals provide an auditable development history.
7. **Requirement Alignment:** Development activities must remain aligned with the approved requirements and acceptance criteria.

---

## 16. Complete Workflow

The complete CivicConnect GitHub workflow can be summarised as:

```text
┌─────────────────────────┐
│ Backlog / Initiation    │
│                         │
│ • New Issue             │
│ • Initial request       │
│ • Priority              │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Requirements Planning   │
│                         │
│ • Define scope          │
│ • Acceptance criteria   │
│ • Assign developer      │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Design                  │
│                         │
│ • Technical design      │
│ • Database/API design   │
│ • Architecture impact   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Development             │
│                         │
│ • Create Git branch     │
│ • Implement change      │
│ • Commit changes        │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ UAT / Review & Testing  │
│                         │
│ • Pull Request          │
│ • Independent review    │
│ • Testing               │
│ • UAT                   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Deployment              │
│                         │
│ • Merge approved change │
│ • Deploy                │
│ • Verify functionality  │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Completed Task          │
│                         │
│ • Close Issue           │
│ • Update Project        │
│ • Record final status   │
└─────────────────────────┘
```