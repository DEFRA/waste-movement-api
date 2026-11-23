---
worth: later
where: src/versions/beta-3/data/generation.js
added: 2026-11-23
---

# Catch a missed DATA_GENERATION bump in CI, not only at boot

Any change to a version's `data/schemas/` (other than to a `title` or `description`) or to its
indexes needs a `DATA_GENERATION` bump. A missed one is only caught when an environment boots and
refuses to start. CI could compare the schemas and indexes with `main`'s, ignoring titles and
descriptions, and fail a change without a bump. The DWTC-317 POC's `scripts/check-data-schemas.js`
shows how to get `main`'s copy (`git archive` of `src/versions`) and run it from
`check-pull-request.yml`.
