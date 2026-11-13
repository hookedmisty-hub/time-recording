# Encrypted incremental sync

## Data and security

- The journal-v2 head remains the account-level CAS revision and key wrapping envelope. Its AES-GCM data now contains only an encrypted delta index: format, initial migration revision, and SHA-256 digest of the full logical state.
- Each record and deliverable is an independently encrypted item. Goals and todos are items per day. Categories, projects (including ordering/archives) and rewards remain atomic units, matching existing conflict semantics.
- Tokens are HMAC-SHA256 over account, key ID and logical path. The server cannot read record IDs, dates, types, content or deletion flags. It can observe ciphertext sizes, item counts and revision activity.
- AES-GCM authenticates account, key ID, token and commit revision. Deletions are encrypted tombstones, retained to support arbitrarily stale devices. Re-adding the same ID replaces its tombstone.
- Every write atomically updates changed items and the head. No-op version checks transfer no item ciphertext. Reads page at 200 items, bound to an exact head revision; a concurrent write aborts the read. The encrypted index digest detects omitted items as well as corruption before local data is applied.
- First migration and a device with no valid baseline require a full download. Catalog/reward changes transfer that unit, not individual fields. Unchanged polls still have small metadata overhead.
- This retains the existing local plaintext storage/JSON exports and threat model. It does not provide protection from a malicious application release or detect rollback of a complete consistent cloud snapshot without an independent trusted witness.

## Activation and rollback

1. Review and apply `004_delta_sync.sql` after migrations 001–003 in the target Supabase project. It is additive and does not migrate any account by itself. Migration 004 was installed in the Time Recording production project on 2026-11-13; RLS and RPC permissions were verified. Account data migrates only on a subsequent changed encrypted save.
2. Publish the new frontend together with the pending local changes. Existing full-bundle servers are supported: if the capability RPC is absent, the app continues the old format. Other RPC errors never trigger downgrade.
3. On the first changed encrypted save, the client transmits the initial encrypted item set, index and existing expected revision. The transaction replaces the old full ciphertext and scrubs legacy plaintext rows together. A failure rolls back everything.
4. Once an account migrates, obsolete clients fail closed when attempting writes. Refresh all devices. Retain the new transport in any frontend rollback; do not deploy an old full-bundle client or drop the item table after an account migrates.
5. Passphrase changes rewrap the same key and update the small index; no unchanged item is re-uploaded. Recovery keys remain valid. Existing unlocked clients adopt the latest wrapping slots as before.

## Verification

Unit tests: `node --test tests/*.test.js`.

The PostgreSQL integration test is optional unless a PGlite runtime is available. To run it without adding a production dependency:

```sh
npm install --prefix /tmp/time-delta-test @electric-sql/pglite --no-audit --no-fund
PGLITE_MODULE=/tmp/time-delta-test/node_modules/@electric-sql/pglite/dist/index.js node --test tests/*.test.js
```

The test runs all four actual migrations in a fresh local PostgreSQL database and verifies old-account migration, new-account initialization, all journal domains, pagination, exact one-item transfers, no-change polling, delete propagation, offline merge, edit/delete conflicts, stale CAS, wrapping/recovery, cross-account/anonymous access denial, old-client downgrade rejection, transaction rollback, omitted-item detection, ciphertext revision binding and concurrent changes during pagination. No production connection or user secrets are used.

A standalone browser demonstration is in the separate workspace `Manage Time/delta-preview`, served on `http://127.0.0.1:5184/`. It uses the actual browser crypto/transport modules with a synthetic in-memory server, not Supabase; its counters are a demonstration, not production usage measurements.
