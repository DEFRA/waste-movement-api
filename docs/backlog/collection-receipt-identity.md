---
worth: later
where: src/versions/beta-3/data/schemas/collection/collection.schema.json
added: 2026-11-17
---

# What identifies a Collection and a Receipt, and what a resubmission does

Open question 2 in [the plan](../plans/20261117-database-layer.md). For now Collections and Receipts get
a generated ObjectId `_id`, plus a non-unique index on `movementId` / `deliveryId`, so a second
`POST /movements/{id}/collection` or `POST /deliveries/{id}/receipt` stores another document. That keeps
today's 201 behaviour. Unknown: whether the natural ID (`movementId`, `deliveryId`) should be `_id`, and
whether a resubmission is an update (see
[updates-and-history-collections](updates-and-history-collections.md)) or a 409. That's a product decision.
