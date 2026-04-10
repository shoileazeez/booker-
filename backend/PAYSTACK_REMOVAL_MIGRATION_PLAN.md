Paystack Removal — Migration Plan

Goal: Safely remove Paystack-specific columns and code paths from the backend after migrating existing payments/subscriptions to Google Play.

Prerequisites
- Take a full backup of the production database (dump + store securely).
- Export current `payments` and `subscriptions` tables to a CSV for archival.
- Deploy a short-maintenance window to coordinate schema change.

Phases

1) Audit & Mark
- Identify all code references to Paystack fields and flows (we currently deprecated endpoints).
- Add a `legacy_paystack_archived` boolean flag to a small admin table (or use a feature flag) to gate schema changes.

2) Ensure data migrated or archived
- For each `payments` row with `purchaseType` linked to Paystack flows, decide retention policy:
  - Archive (move) to `payments_archive` table with full rawResponse and metadata
  - Or keep in place for historical reporting

3) Create migration (reversible)
- Create a TypeORM migration that:
  - Adds `payments_archive` table
  - Moves rows where `paystackTransactionId IS NOT NULL` from `payments` -> `payments_archive`
  - Optionally NULLs `paystackTransactionId`, `paystack_*` fields in `subscriptions` and `payments`
  - Does NOT drop columns on first run — instead mark them deprecated in schema comments

4) Run migration in staging and verify
- Run migration on staging, perform smoke tests on billing flows, subscriptions, and lookups.

5) Remove code references (gradual)
- Remove or keep-but-deprecate controller/service code paths that reference Paystack.
- Deploy code that no longer writes new Paystack-dependent data.

6) Final schema cleanup (after 30+ days)
- After monitoring, create a final migration to drop Paystack columns and archive tables if desired.
- Run final migration in maintenance window.

Notes
- Keep migrations reversible where possible.
- Prefer archiving over deleting to maintain audit trails.
- Coordinate with finance/ops for regulatory retention requirements.

I can generate the TypeORM migration SQL for steps 3 and 6 if you want; tell me whether to (A) produce an archive-and-null migration now, or (B) produce the final drop migration now (not recommended without an archive).