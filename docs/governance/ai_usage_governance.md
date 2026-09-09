# CivicConnect — AI Governance Policy & Verification Report

## 1. Overview & Governance Policy

This document establishes the AI governance policy for the CivicConnect engineering project. The integration of Artificial Intelligence (AI) tools—including Gemini and Claude—is permitted strictly in a supportive capacity (e.g., formatting, initial drafting, summarisation, and sentence restructuring). 

To ensure system integrity, accurate technical specifications, and alignment with SEN381 quality standards, all team interactions with AI must adhere to the following governance principles:

* **Human-in-the-Loop Verification:** No AI-generated output may be integrated directly into project artefacts without thorough review, cross-checking, and validation by a human engineer.
* **Traceability & Precision:** AI tools must not be relied upon to auto-generate critical traceability identifiers or domain-specific logic without direct human oversight and verification.
* **Hallucination & Misinformation Control:** Outputs containing fabricated real-world data, omitted requirements, or extraneous commercial references must be rejected or corrected during human review.
* **Auditability:** Every significant AI contribution must be logged, detailing the specific task, tool used, human verification performed, final decision, and any defects identified.

---

## 2. AI Contribution & Audit Log

The table below details the audit trail of AI assistance across project development tasks:

| Date | Student | Tool | Engineering Task | AI Contribution | Human Verification Applied | Decision | Issues Found |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2026-09-08** | Member 3 | Gemini | Formatting the Stakeholder Analysis & Risk Register tables. | Generated basic markdown table structures and offered light phrasing suggestions for readability. | Manually populated the tables with project-specific engineering data, derived requirements, and verified all fields against the SEN381 artefact quality checklist. | Accepted for formatting only | The AI placeholders lacked the required traceability IDs. These were manually created and inserted to meet traceability standards. |
| **2026-09-08** | Member 2 | ChatGBT | Summarising | Generated an in-detail summarisation of CivicConnect’s Information | Read through the document and verified it | Accepted summarisation | Some information was deemed not important and left out. |
| **2026-09-09** | Member 2 | Gemini | Restructuring | Fixed broken sentence structures | Compared sentences to each other to make sure details weren’t left out or misinformation was added | Accepted Sentence restructuring only | AI added misinformation based on companies that exist; it was rejected |