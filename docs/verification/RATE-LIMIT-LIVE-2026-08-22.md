# Live distributed rate-limit verification — 2026-08-22

Purpose: trigger the repository's dedicated, fail-closed synthetic concurrency verification against the Fakturasjekk production Postgres rate-limit RPC.

The workflow must use a unique synthetic key, 12 independent concurrent PostgreSQL connections, verify an exact final count of 12, and delete the synthetic row afterward.

This verification does not open customer upload/API access, does not process customer data, and does not activate OCR/AI or payment providers.

Status: pending GitHub Actions result. This file is evidence scaffolding only and must not be treated as proof until the workflow is green.
