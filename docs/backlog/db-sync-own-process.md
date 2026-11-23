---
worth: later
where: src/versions/beta-3/index.js
added: 2026-11-23
---

# Run the DB schema sync in its own process, once per deploy

`syncDataSchemas` runs at boot in every web replica, so each may create collections and indexes. It's
meant to run once per deploy, e.g. as `npm run db:sync` from the same image, with `beta3.register`
only checking, read-only, that each collection's validator and indexes equal its schemas (refusing to
start otherwise). `syncDataSchemas` doesn't depend on Hapi, so only the script and the check are new.
Unknown: whether CDP can run a one-off task per deploy, or it has to be a separate service with one
replica (asked the team).
