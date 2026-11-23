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
name), ajv error mapping, the waste-tracking-id-backend client, collection naming, the DB schema
sync, route error handling, the organisation header and the OpenAPI `$ref` resolver. Anything that
encodes the contract stays in the version folder, even if it's currently identical across versions.

**Why:** shared contract code is how versions drift into each other. Generic code changing for every
version at once is what we want.

## Data generations, reset by hand

Each version stores data in its own collections, `<version>-g<DATA_GENERATION>-<name>`. Any change
to a DB schema (other than a title or description) or its indexes is a new generation: a developer
bumps `DATA_GENERATION`, and the service starts on new, empty collections. The old generation's are
left behind, not dropped. There is no migration. (Renamed from "data revision", so it can't be
confused with a per-document revision.)

**Why:** beta data is disposable, so a reset is enough, and a manual bump is simple and explicit.

**Risk accepted:** a rollback across a bump resumes the older generation, which is still there, so
each generation holds its own stretches of the timeline, and what was stored on the newer one can't
be found until it's deployed again. A rollback within a generation, as most are, isn't affected.

## DB schemas enforced by MongoDB, checked at boot

Each version's `data/schemas/` specifies what's stored. At boot, a missing collection is created with
its schema as its validator and with its indexes; an existing one must match them exactly, or the
service refuses to start until `DATA_GENERATION` is bumped. Validators and indexes are never changed
on an existing collection.

**Why:** the stored shape is reviewed like the API's, and MongoDB rejects a write that doesn't match,
from any client. Checking only collection metadata keeps boot fast however much is stored, and
needs only the `readWrite` role; never changing an existing collection means there's no deciding
which changes are safe.
