# Blockers

> Active blockers only. Resolved blockers are struck through with a resolution + commit hash.

### B-001 — Retrieval probe needs a pre-migration baseline
Raised 2026-08-24. The probe cannot score a conversion that has already happened; the baseline
run has to be taken while the v2 log is still the live record.
