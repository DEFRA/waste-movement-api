# waste-movement-api

Backend API for the waste movement journey in Defra's Digital Waste Tracking (DWT) service, running on the
Core Delivery Platform (CDP). Built from the CDP Node.js backend template.

- [About this service](#about-this-service)
  - [Current state](#current-state)
  - [Where it fits](#where-it-fits)
- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Local development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Testing](#testing)
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

The service runs, connects to MongoDB and serves `GET /health`. The waste movement routes are not added yet.

### Where it fits

This is how the service is planned to work, mirroring how `waste-movement-backend` serves the earlier
versions:

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

To test the application run:

```bash
npm run test
```

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

| Endpoint       | Description |
| :------------- | :---------- |
| `GET: /health` | Health      |

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
- MongoDB
- This service.
- A commented out frontend example.

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
