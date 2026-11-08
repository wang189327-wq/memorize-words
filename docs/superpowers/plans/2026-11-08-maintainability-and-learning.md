# Memorize Words reliability and learning implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the four user-approved upgrade stages without losing existing books, progress or favorites.

**Architecture:** Keep JavaScript/Java and the existing four pages. Split durable records from the book, isolate FSRS rules, and add offline/backup adapters. Commit only after the corresponding failure paths pass.

**Tech Stack:** Browser ES modules, IndexedDB, Android Java/SQLite, Node HTTP/Tablestore, fixed ts-fsrs, WebCrypto, Service Worker.

**Spec:** `docs/superpowers/specs/2026-11-08-maintainability-and-learning-design.md` (user approved 2026-11-08).

## Global Constraints

- Maintain cn.ielts75.app and the existing owner signing key; next release 1.1 / code2.
- No private book, credentials or user progress in public source/assets.
- Preserve schema1 import, four pages, four practice modes and manual selection/sync.
- FSRS events are retained independently of the 50000-entry results display limit.
- Use the existing ES-module style, descriptive interfaces and documented migration contracts.
- Implement natively in this session; independent review before final delivery. Optional execution skills are not installed locally.

## Review Focus

- Failed/interrupted migration leaves the old source readable and retryable.
- Old backend cannot silently discard or falsely acknowledge new rating events.
- Two offline devices, duplicate IDs, conflicts and time-zone changes produce deterministic schedules.
- Failed PWA updates retain the previous shell and never delete IndexedDB records.
- Wrong password, tampering and oversized encrypted backups never replace current progress.

### Task 1: Documentation, fork guard, CSP

**Files:** `tools/check-config.mjs`, `tests/unit/config.test.cjs`, `web/index.html`, `.github/workflows/ci.yml`, `package.json`, F root README, `docs/architecture.md`.

**Interfaces:** `checkConfig(config, repository)` returns validation messages; CLI exits nonzero on unsafe fork update settings. HTML CSP allows same-origin scripts and user-configurable HTTPS sync.

- [ ] Add configuration tests for owner, disabled updates, own fork channel and accidentally retained owner channel.
- [ ] Implement the guard and wire it into CI/public checks; update the stale F README paragraph.
- [ ] Add CSP and verify actual import/export, theme styles, two-device browser sync and all existing tests.
- [ ] Commit and report stage one completion.

### Task 2: Storage boundaries and browser transactions

**Files:** `web/storage/` focused adapters, `web/browser-store.js`, `web/ui/state.js`, `web/app.js`, `web/ui/backup.js`, `tools/benchmark-storage.mjs`, browser storage tests.

**Interfaces:** a `Storage.commit(next, previous, options)` adapter writes changed records and resolves only after a successful transaction; initial migration/full import validates everything, normal commands validate changed records without rescanning the deck. `load` reconstructs compatible in-memory state.

- [ ] Record repeatable synthetic performance baselines; include real 5470-card measurement only in local reports.
- [ ] Implement record separation, stable legacy event IDs and transactional schema1 migration; guard old-tab `versionchange`.
- [ ] Test interrupted/failed migration, incremental single-event write, favorite removal, restore and stale concurrent contexts.

### Task 3: Native SQLite persistence

**Files:** `android/.../LearningStorage.java`, new focused SQLite helper, `MainActivity.java`, storage bridge and tests.

**Interfaces:** retain `load/save` compatibility for old Web assets; add incremental transaction API accepting only changed records, expose errors to the common commit adapter. Legacy AtomicFile is read only during verified migration.

- [ ] Implement transaction storage and migration, then validate its contract with local Android unit/build checks.
- [ ] Compare old/new serialized writes; do not claim actual device timings without a connected device.
- [ ] Test browser/native resource consistency and run existing storage failure regressions.
- [ ] Commit and report stage two completion with measured scope.

### Task 4: FSRS rules and due review

**Files:** `web/domain/scheduler.js`, dependency export script, `web/ui/review.js`, core backup validators, scheduler unit/browser tests.

**Interfaces:** `dueCards(state, now)`, `recordRating(state, event)`, deterministic `rebuildSchedule(events, parametersVersion)`; algorithm defaults are centralized and versioned. Append immutable events, never guess missing old four-way grades.

- [ ] Pin the maintained library and export its browser build with license/hash provenance.
- [ ] Implement schema2 backup model and old learned-card initialization; preserve all existing selectors.
- [ ] Add four feedback buttons and due queue; avoid treating 7/18 within-session drills as independent long-term reviews.
- [ ] Test deterministic replays, duplicates, conflicting IDs, same timestamps, time zones and legacy backups.

### Task 5: Rating sync protocol

**Files:** `cloud/server.cjs`, `cloud/store.cjs`, `web/sync.js`, rating tests, cloud documentation.

**Interfaces:** capability detection and separately paginated rating endpoints; immutable `eventId`, book namespace, `algorithmVersion` and UTC timestamp. Return409 for divergent duplicate content. Old progress/favorite routes keep their existing shape.

- [ ] Test new/old server combinations, two offline clients, retry, event conflicts and manual-sync-only behavior.
- [ ] Implement independent dirty/success tracking and deterministic local rebuild after merge.
- [ ] Package backend source/deployment changes; document that real Aliyun deployment remains separate.
- [ ] Commit and report stage three completion.

### Task 6: Offline web shell

**Files:** `web/manifest.webmanifest`, `web/sw.js`, `web/offline.js`, generated resource manifest tool and browser offline tests.

**Interfaces:** generated shell manifest includes every static runtime asset; worker activates only after full install, skips cloud responses and APKs. No worker registration under AndroidStore.

- [ ] Test initial caching, offline reopen, subpath deployment, interrupted update and IndexedDB preservation.
- [ ] Implement versioned caches and an explicit update action outside active learning.

### Task 7: Optional encrypted backups

**Files:** `web/domain/backup-crypto.js`, `web/ui/backup.js`, settings backup controls, crypto tests and backup format docs.

**Interfaces:** `encryptBackup(state, password)` / `decryptBackup(envelope, password)` with versioned, authenticated metadata, bounded PBKDF2 parameters and AES-GCM; plain backups remain supported.

- [ ] Test Unicode passwords, random salt/IV, roundtrip, wrong password, tampering and size/parameter rejection.
- [ ] Implement confirmed passwords and guarded restore; check both browser and Android import/export byte limits.

### Task 8: Open-source handoff and release

**Files:** README, CONTRIBUTING, architecture/data/deployment docs, issue templates, original demo screenshots, release metadata.

- [ ] Add screenshots/quick start, Topics and issue templates; show exact source entry points and commands for new modules.
- [ ] Run format/lint/public/config checks, all meaningful tests, Android release/unit build and dependency audit.
- [ ] Independent review the full branch; resolve actionable findings and rerun affected tests.
- [ ] Build 1.1/code2 public sample APK and manifests; verify signature, package, book boundary and download hash.
- [ ] Publish only verified results; copy sources, packages and report to F, regenerate hashes, report stage four and remaining external acceptance honestly.
