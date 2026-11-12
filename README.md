# waste-movement-api

Backend API for the waste movement journey in Defra's Digital Waste Tracking (DWT) service, running on the
Core Delivery Platform (CDP). Built from the CDP Node.js backend template.

- [About this service](#about-this-service)
  - [Current state](#current-state)
  - [Where it fits](#where-it-fits)
- [API versions](#api-versions)
  - [Layout](#layout)
  - [Adding a version](#adding-a-version)
  - [Retiring a version](#retiring-a-version)
  - [Stored data and DATA_REVISION](#stored-data-and-data_revision)
- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Testing](#testing)
  - [Integration tests](#integration-tests)
  - [Environment variables](#environment-variables)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [API endpoints](#api-endpoints)
- [Development helpers](#development-helpers)
  - [Proxy](#proxy)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## About this service

This is the Phase 2 API service, created under DWTC-337 to decouple the Phase 2 API from Phase 1 by
[splitting waste-movement-backend](https://refactored-train-pzzv3pk.pages.github.io/collections/phase2/backend-split/)
(DWT ADR 11).

It will serve the Phase 2 waste movement APIs, and in time the national waste movements API: the journey a
waste movement takes from creation to receipt. It covers:

- creating a movement
- recording its collection
- recording its delivery
- recording receipt of the waste, including waste received with no prior delivery

Earlier versions of this journey are served by
[waste-movement-backend](https://github.com/DEFRA/waste-movement-backend), alongside the Receipt of Waste API.

### Current state

The service serves the Phase 2 waste movement journey as **`beta-3`**, ported from
`waste-movement-backend`'s `beta-2` (at `b067981`) with the same contract: routes, JSON Schemas,
OpenAPI spec and storage. It has no Phase 1 (Receipt of Waste) endpoints and no `beta-1`.

Not done yet:

- `waste-movement-external-api` doesn't route any traffic here yet.
- The bundled OpenAPI spec isn't served (`GET /beta-3/openapi.json`); the spec is in
  [src/versions/beta-3/schemas/openapi.json](src/versions/beta-3/schemas/openapi.json).
- No Schemathesis or cross-repo UAT coverage for `beta-3`.

### Where it fits

It works the way `waste-movement-backend` serves the earlier versions:

- **Internal, not internet-facing.** Called by
  [waste-movement-external-api](https://github.com/DEFRA/waste-movement-external-api), which authenticates
  external callers and forwards the caller's organisation in the `x-dwt-organisation-id` header.
- **HTTP Basic auth** for callers, with credentials from `ACCESS_CRED_*` environment variables.
- **Owns its own MongoDB database**; no other service reads or writes it.
- **Calls [waste-tracking-id-backend](https://github.com/DEFRA/waste-tracking-id-backend)** for movement and
  delivery IDs.

The DWT architecture is modelled in
[digital-waste-tracking-docs](https://github.com/DEFRA/digital-waste-tracking-docs), which does not include
this service yet.

## API versions

### Layout

Everything specific to one version lives in its folder, so versions can't drift into each other.
What doesn't depend on the contract is shared.

```
src/
  common/              shared by every version
    validation/        createValidators(schemaRoot): JSON Schema request/response validators,
                       ajv errors mapped to the 400's errors[], withPayloadChecks
    http/              waste-tracking-id-backend client: createMovementId, createDeliveryId
    data/              versionedCollections, sweepStaleRevisions, isDuplicateKeyError
    openapi/           bundle(specPath): an OpenAPI document with every $ref resolved
    organisation.js    getOrganisationId, from the x-dwt-organisation-id header
    route-errors.js    handleBetaRouteError
  plugins/
    router.js          GET /health, and one register() per version
    journey-logger.js  logs each journey step against its Movement and Delivery IDs
  versions/beta-3/
    index.js           the version's plugin: its routes, indexes and stale-data sweep
    routes/            one file per endpoint, each a function of the version (index.js)
    schemas/           JSON Schemas, examples, openapi.json and the conventions they follow
    checks/            payload checks: rules a schema can't express
    data/              DATA_REVISION, and movement and delivery data access
    tests/             its integration tests, over real HTTP (unit tests sit beside their code)
```

### Adding a version

1. Copy the latest version's folder: `cp -r src/versions/beta-3 src/versions/beta-4`.
2. In the copy, set `apiVersion` in `index.js`, rename the plugin export,
   and set `info.version` and `servers[].url` in `schemas/openapi.json`. Search the folder for the
   old version name to catch the rest (test names, collection names in tests).
3. Set `DATA_REVISION` in `data/revision.js` back to `1`: the new version starts on its own
   collections.
4. Register it in [src/plugins/router.js](src/plugins/router.js):
   `await server.register(beta4, { routes: { prefix: '/beta-4' } })`.
5. Add its routes to [test/integration/expected-routes.js](test/integration/expected-routes.js) and
   [src/plugins/router.test.js](src/plugins/router.test.js).

Then change the new version freely; the old one is untouched.

### Retiring a version

Delete its folder and its line in `router.js`, and its routes from the route lists in tests. Its
collections (`<version>-r<N>-*`) are left in MongoDB; drop them by hand once nothing needs them.

### Stored data and DATA_REVISION

Each version stores its data in its own collections, named `<version>-r<DATA_REVISION>-<name>`, e.g.
`beta-3-r1-movements` and `beta-3-r1-deliveries`.

**Bump `DATA_REVISION`** (in the version's `data/revision.js`) when a change means the code can no
longer read what's already stored, e.g. a stored field is renamed, moved or changes type. Adding a
field the code treats as optional doesn't need a bump. There is no migration: on its next boot the
service starts on new, empty collections and drops that version's collections for every other
revision. Beta data is disposable, so this is the reset.

Note that every instance sweeps on boot. While a deploy that bumps the revision rolls out, old
instances keep writing to the old revision's collections, which a new instance may already have
dropped; and an old instance that restarts mid-rollout would drop the new revision's. Bump it only
where losing data written during the rollout is acceptable.

Indexes are created on boot: `movementId` is unique; `deliveryId` isn't, since a resubmitted
hazardous Movement has a delivery record per submission. Creating a movement retries a failed
write, and a retry that finds its `movementId` already stored counts as success (the earlier attempt
landed, but its acknowledgement was lost). The first attempt finding it stored means the ID was
minted twice, which is a 500.

## Requirements

### Node.js

Please install [Node.js](http://nodejs.org/) `>= v24` and [npm](https://nodejs.org/) `>= v11`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd waste-movement-api
nvm use
```

## Local development

### Setup

Install application dependencies:

```bash
npm install
```

### Git hooks

Install git hooks (optional). The pre-commit hook runs the security audit, format check, lint and tests.

```bash
npm run setup:husky
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### Testing

To run the unit and route tests, with coverage, run:

```bash
npm run test
```

They share one in-memory MongoDB replica set for the whole run (`.vite/mongo-memory-server.js`).

### Integration tests

To run the service over real HTTP, against an in-memory MongoDB and a stub waste-tracking-id-backend:

```bash
npm run test:integration
```

See [test/integration/README.md](test/integration/README.md). CI runs both.

### Environment variables

See [.env.example](.env.example) and [src/config.js](src/config.js). The ones specific to this service:

| Variable                                   | Purpose                                                                                                          |
| :----------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `ACCESS_CRED_*`                            | One per caller: base64 of `<username>=<password>`, checked by HTTP Basic auth                                    |
| `WASTE_TRACKING_URL`                       | waste-tracking-id-backend's base URL. Defaults to the one in the same CDP environment                            |
| `SERVICE_AUTH_PASSWORD_WASTE_MOVEMENT_API` | The password sent to waste-tracking-id-backend as `waste-movement-api` (`SERVICE_AUTH_USERNAME_…` sets the user) |
| `PROBLEM_DETAILS_TYPE_BASE`                | Base URI of the RFC 9457 problem `type`s in error responses                                                      |

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json).
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## API endpoints

Every route but `/health` needs HTTP Basic auth, and every error is an RFC 9457 problem response
(`application/problem+json`). The beta routes also need the caller's organisation in the
`x-dwt-organisation-id` header, which waste-movement-external-api sets.

| Endpoint                                          | Description                                |
| :------------------------------------------------ | :----------------------------------------- |
| `GET: /health`                                    | Health (no auth)                           |
| `POST: /beta-3/movements`                         | Create a Movement                          |
| `POST: /beta-3/movements/{movementId}/collection` | Record the Collection for a Movement       |
| `POST: /beta-3/deliveries`                        | Record a Delivery of one or more Movements |
| `POST: /beta-3/deliveries/{deliveryId}/receipt`   | Record receipt of waste against a Delivery |
| `POST: /beta-3/receipts`                          | Record receipt of undocumented waste       |

The request and response bodies are defined in [src/versions/beta-3/schemas](src/versions/beta-3/schemas),
described by its [openapi.json](src/versions/beta-3/schemas/openapi.json).

## Development helpers

### Proxy

We are using forward-proxy which is set up by default. Services are automatically configured with the proxy environment variables when deployed.

Node.js 24 uses these variables to route outbound HTTP(S) requests through the proxy:

NODE_USE_ENV_PROXY=1
HTTPS_PROXY=...
NO_PROXY=...

No additional proxy configuration is required in the service.

## Docker

Build:

```bash
docker build --no-cache --tag waste-movement-api .
```

Run:

```bash
docker run -e PORT=3001 -p 3001:3001 waste-movement-api
```

### Docker Compose

A local environment with:

- Floci for AWS services (S3, SQS, SNS etc)
- Redis
- MongoDB, as a one-node replica set (deliveries are written in a transaction)
- waste-tracking-id-backend, built from a sibling checkout: clone it next to this repo
- This service.

Credentials default to made-up local-only values; set your own in `.env` (see
[.env.example](.env.example)).

```bash
docker compose up --build -d
```

Mock AWS resources can be created when Floci starts up by editing the scripts in `./compose/floci/start.d/`.
MongoDB records can also be created when Mongo starts by editing the scripts in `./compose/mongo/`.

### Dependabot

Dependabot is configured in [.github/dependabot.yml](.github/dependabot.yml). It proposes npm and GitHub
Actions updates weekly, and only npm versions at least 7 days old, matching `min-release-age` in
[.npmrc](.npmrc).

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties)

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
