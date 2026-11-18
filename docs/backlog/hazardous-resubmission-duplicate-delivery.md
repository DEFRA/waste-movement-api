---
worth: yes
where: src/versions/beta-3/data/deliveries.js:80
added: 2026-11-17
---

# A resubmitted hazardous Movement creates a duplicate Delivery

A hazardous Movement's Delivery ID is its own Movement ID, so delivering it twice stores two Deliveries
with the same `deliveryId` (open question 3 in [the plan](../plans/20261117-database-layer.md)).
Deliveries keep a generated `_id` and a non-unique `deliveryId` index so this still works as before, and
`findDeliveryMovementIds` deduplicates across the copies. To be handled as a follow-up: make it either an
update or a 409, then make `_id` the Delivery ID (a breaking schema change, so bump `DATA_GENERATION`).
