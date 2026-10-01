# 🌆 CivicConnect — Community Service Request Platform
> **SEN381 Integrated Team Project**  
> *Engineered by Team RubberDucks*

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![OpenAPI 3.0](https://img.shields.io/badge/OpenAPI_3.0-85EA2D?style=for-the-badge&logo=openapi-initiative&logoColor=black)

---

## 📌 About CivicConnect

**CivicConnect** is a modern, web-based municipal service request and triage platform designed to replace manual, fragmented communication channels (phone calls, emails, paper forms) with a transparent digital workflow. 

It empowers citizens to log community infrastructure issues (potholes, water pipe bursts, power outages), while providing municipal staff and executive management with tools to triage, assign, dispatch, and track service requests to resolution under strict **Service Level Agreements (SLAs)**.

---

## 🛠️ Tech Stack & System Architecture

CivicConnect is built as a **stateless, resource-oriented Modular Monolith**:

* **Backend Runtime:** Node.js + Express.js
* **API Architecture:** RESTful OpenAPI 3.0 Contract
* **Database & Persistence:** PostgreSQL 14+
* **Authentication:** Stateless JWT Bearer Tokens
* **Design Patterns:** GoF Structural Adapter Pattern

---

## 👥 Team RubberDucks — Role Allocation

| Team Member | Engineering Lead Role | Primary Responsibilities |
| :--- | :--- | :--- |
| **Marcus** | **Architecture & System Lead** | System architecture, risk management, PED master governance, CI/CD pipelines |
| **Tobie** | **Persistence & Data Lead** | Relational schema design, PostgreSQL migrations, data integrity, audit logging |
| **Theart* | **UI, APIs & Admin Lead** | OpenAPI 3.0 specification, Express controllers/routes, RBAC middleware, Contractor Adapter |

---

## 🚀 Core Platform Capabilities

### 📱 1. Citizen Requester Portal
* **Fault Submission:** Log issues with leaf taxonomy codes, street location, description, and photo evidence.
* **Tracking System:** Instant generation of immutable tracking references (`CC-2026-XXXX`).
* **Live Status Stepper:** Real-time milestone visibility (`Submitted` ➔ `Assigned` ➔ `In_Progress` ➔ `Resolved` ➔ `Closed`).

### ⚙️ 2. Staff Operations Console
* **Triage Queue:** Department-scoped queue filtering by status, category, and urgency.
* **Ownership Locking:** Assign tickets to specific operational staff members with timestamp locks.
* **State Machine Engine:** Controlled status transitions preventing invalid lifecycle jumps.
* **Internal Action Log:** Append immutable, staff-only comments hidden from public view.

### 🔌 3. Third-Party Contractor Dispatch (Design Pattern 2)
* **Adapter Pattern Boundary (`IContractorAdapter`):** Encapsulates external municipal vendor APIs behind a uniform interface, protecting core controllers from vendor breaking schema updates.

### 📊 4. Executive Management Analytics
* **Activity Summaries:** Real-time breakdown of ticket volumes by category and status.
* **SLA Overdue Tracking:** Automated detection of unaddressed tickets exceeding time thresholds (e.g., >48 hours).

---

## 🔐 Security & RBAC Matrix

Security is enforced at the API Gateway via `auth.middleware.ts` using stateless JWT role claims:

```
+-------------------------------+-----------------+-------+------------+------------+
| Endpoint Path & Method        | Requester       | Staff | Management | Contractor |
+-------------------------------+-----------------+-------+------------+------------+
| POST /api/v1/auth/login       | ALLOW           | ALLOW | ALLOW      | ALLOW      |
| POST /api/v1/tickets          | ALLOW           | ALLOW | DENY (403) | DENY (403) |
| GET  /api/v1/tickets          | ALLOW (Own Only)| ALLOW | ALLOW      | ALLOW      |
| PATCH /api/v1/tickets/:id/status| DENY (403)    | ALLOW | ALLOW      | DENY (403) |
| PUT  /api/v1/tickets/:id/assign| DENY (403)     | ALLOW | ALLOW      | DENY (403) |
| POST /api/v1/tickets/:id/dispatch| DENY (403)  | ALLOW | ALLOW      | DENY (403) |
| GET  /api/v1/admin/*          | DENY (403)      | DENY  | ALLOW      | DENY (403) |
+-------------------------------+-----------------+-------+------------+------------+
```

---

## 📁 Repository Directory Structure Plans (`/api`)

```text
api/
├── app.ts                           # Express application entry point & RFC 7807 error handler
├── adapters/
│   └── contractor.adapter.ts        # Third-Party Contractor Adapter (Design Pattern 2)
├── middleware/
│   └── auth.middleware.ts           # JWT authentication & RBAC authorization middleware
├── controllers/
│   ├── auth.controller.ts           # Authentication & token issuance controller
│   ├── ticket.controller.ts         # Service request lifecycle controller
│   └── admin.controller.ts          # Executive analytics & SLA monitoring controller
└── routes/
    ├── auth.routes.ts               # Authentication REST routes (/api/v1/auth)
    ├── ticket.routes.ts             # Service request REST routes (/api/v1/tickets)
    └── admin.routes.ts              # Executive analytics REST routes (/api/v1/admin)
```

---

## 💻 Local Quickstart & Development Setup

### 1. Prerequisites
* Node.js (v18 or higher)
* npm / yarn
* PostgreSQL

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/RubberDucks-SEN381/CivicConnect.git
cd CivicConnect

# Install dependencies
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=SECRET
CONTRACTOR_API_URL=URL
CONTRACTOR_API_KEY=MOCK_VENDOR_KEY
```

### 4. Running the API Gateway
```bash
# Open the folder for civicconnect
cd civicconnect

# Install all depedencys
npm install

# Run in development mode with hot reload
npm run dev

# Compile TypeScript and start production server
npm run build
npm start

git config --unset-all remote.upstream.fetch
git config --add remote.upstream.fetch "+refs/heads/:refs/remotes/upstream/"

```

---

## 📝 Traceability & Project Governance

This codebase directly implements the architectural choices committed in **PED v2.0**:
* **ADR-02:** Node.js + Express + TypeScript + PostgreSQL Modular Monolith
* **ADR-04:** Structural GoF Adapter Pattern for External Vendor Isolation (`IContractorAdapter`)
* **OpenAPI Contract:** Fully validated contract published in `openapi.yaml`
* **GitHub Project:** Fully transparent work devision and tracking
***
