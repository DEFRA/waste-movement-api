---
worth: later
where: src/common/data/sync-collection.js
added: 2026-11-17
---

# Confirm the CDP Mongo user can update a collection validator

`syncCollection` updates a changed validator in place with `collMod`, which needs the `dbAdmin` role. If
the CDP user only has `readWrite`, boot fails with "Can't update the validator of …: bump
DATA_GENERATION" on any schema change, including a non-breaking one. It fails on purpose, because writes
would otherwise be checked against the old schema. Open question 1 in
[the plan](../plans/20261117-database-layer.md). Unknown: the role CDP grants. If it's `readWrite` only,
either ask CDP for `dbAdmin` or treat every DB schema change as needing a bump (and say so in the DB
schemas README).
