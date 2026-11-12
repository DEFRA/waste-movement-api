# Design decisions

Why the service is shaped the way it is. The [README](../README.md#api-versions) describes the
layout and how to work with it; this records the choices behind it.

## One folder per API version

Everything specific to a version (routes, JSON Schemas, OpenAPI spec, payload checks, data access,
its tests) lives in `src/versions/<version>/`. Adding a version is copying the folder; retiring one is
deleting it.

**Why:** in `waste-movement-backend`, versions share files keyed by a version string, so changing one
version risks changing another, and retiring one means finding its pieces across the tree. Duplicating
a folder is cheap, and lets a new version change freely while the old one stays untouched.

## Shared code is only what doesn't depend on the contract

`src/common/` holds generic machinery: the validator (parameterised by schema root, not by version
name), ajv error mapping, the waste-tracking-id-backend client, collection naming and the stale-data
sweep, route error handling, the organisation header and the OpenAPI `$ref` resolver. Anything that
encodes the contract stays in the version folder, even if it's currently identical across versions.

**Why:** shared contract code is how versions drift into each other. Generic code changing for every
version at once is what we want.

## Data revisions, reset by hand

Each version stores data in its own collections, `<version>-r<DATA_REVISION>-<name>`. When the stored
shape changes incompatibly, a developer bumps `DATA_REVISION`; on boot the service drops that
version's collections for every other revision. There is no migration.

**Why:** beta data is disposable, so a reset is enough, and a manual bump is simple and explicit.
