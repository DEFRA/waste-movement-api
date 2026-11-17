---
worth: yes
where: src/common/data/entity-store.js:81
added: 2026-11-17
---

# ETag and If-Match aren't exposed over HTTP

Every stored document now carries `revision` (0 on insert, see `entityStore.newDocument`), which
[the database layer plan](../plans/20261117-database-layer.md) §2 makes the ETag. Nothing exposes it
yet: no 201 or read returns `ETag: "<revision>"`, no route accepts `If-Match`, and openapi.json documents
neither. To do: return the ETag, filter a write on `{ _id, revision }` when `If-Match` is sent and answer
412 when nothing matches, and document both in openapi.json. Deferred while beta-3 has no update or read
routes. Depends on [updates-and-history-collections](updates-and-history-collections.md).
