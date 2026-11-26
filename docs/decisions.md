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

## A document keeps its request, plus only the fields the logic needs

Every stored document holds the request body (`payload`, UTF-8 JSON bytes), an envelope, and
only the business fields a lookup or rule reads: a Movement keeps `isHazardous`, not its waste items.
Each data module picks those fields explicitly when it builds the document; there are no separate
API ↔ DB mappers, as every response today holds only IDs and routes build them inline. Add a mapper
when a read endpoint needs a response built from `payload`.

`payload` is the parsed body serialised again, so it's the same data as sent but not necessarily the
same bytes (see the schema README).

**Why:** the stored request is always the data the client sent, and the business fields stay small
and can change freely, since they can be worked out from the payload again.

## `_id` is internal; `requestId` links what one request created

Every document's `_id` is a generated ObjectId that's never exposed. Public IDs (`movementId`,
`deliveryId`) are fields of their own, with their own indexes. Instead of a `traceId` for the last
writer, a document has the `requestId` of the request that created it, which is the `x-request-id`
the API returned and never changes.

**Why:** the public IDs aren't always unique (a resubmitted hazardous Movement's Delivery ID repeats),
and keeping them out of `_id` leaves room to change that. A `requestId` that never changes is what
ties together the several Deliveries one `POST /deliveries` records, and a client can quote it from
the response. Later writers will be recorded by a history collection, once documents can be updated.

## A document records the software provider as well as the organisation

Beside `orgId`, every document has the `clientId` of the software provider that sent the request (its
Cognito token's `client_id`, forwarded by the external API) and its `clientName` at the time, or null
when the external API couldn't look it up. A missing client ID is a 500, not a 400: the external API
rejects a token without one, so it's a fault between the two services, not the caller's.

**Why:** an organisation can use more than one software provider, or switch, and what's sent can differ
between them, so knowing which sent a request helps to debug it. The ID is what to query by; the name
can change, so it's a snapshot, kept only to read. Neither takes part in telling a resubmission from a
conflict: the same organisation's same request through another provider is still the same request.

## A Movement is collected once and a Delivery received once; a different second one is a 409

A Collection's `movementId` and a Receipt's `deliveryId` each have a unique index. When a
`POST /movements/{movementId}/collection` or `POST /deliveries/{deliveryId}/receipt` finds the key taken,
the stored document's `orgId` and `payloadHash` decide (see `insertOnce`): the same organisation's same
request is answered `201` again and nothing more is stored; anything else is `409 Conflict`, and the
first is kept. The index also stops two concurrent requests both storing one.

`payloadHash` is SHA-256 of the request's JSON with every object's keys sorted, so a retry that orders
or spaces its keys differently is still the same request. An array's order is meaning, so it counts.

**Why:** a client retrying a request whose response it lost must not be told it conflicts with itself,
while a different second Collection or Receipt is a conflict with the stored state, not a malformed
request, and `409` says so. This departs from the
[API standards](../../digital-waste-tracking-api-docs/docs/api/standards.md) §1, which hold off on
`409` and keep `400` for every client error.

**Risk accepted:** an undocumented receipt (`POST /receipts`) mints a new Delivery ID every time, so it
has no key to find a resubmission by, and a retry records a second one.
