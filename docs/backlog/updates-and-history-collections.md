---
worth: later
where: src/common/data/entity-store.js:29
added: 2026-11-17
---

# Documents can't be updated, and there are no _history collections

[The plan](../plans/20261117-database-layer.md) §1–2 has each entity keep earlier versions in a
`<collection>_history` collection (`{ entityId, revision, archivedAt, snapshot }`). An update runs in one
transaction: copy the current document to history, then overwrite it filtered on its `revision`, and abort
(409) if the revision moved. The store only inserts for now, since no route updates anything. Unknown:
whether beta-3 gets update routes at all, which hangs on
[collection-receipt-identity](collection-receipt-identity.md). The history schema can be built from the
entity's own schema (`snapshot: <entity schema>`) instead of another file per entity.
