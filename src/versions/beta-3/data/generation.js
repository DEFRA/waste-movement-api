// The generation of this version's stored data: one number for all of its
// collections (`beta-3-g<N>-*`), so they always change together. Bump it for a
// breaking change to a schema in data/schemas/ (a field removed, renamed or
// retyped, or a new required field): on its next boot the service starts on
// new, empty collections and drops the old generation's. `npm run
// check:data-schemas` fails a breaking change made without a bump. There is
// no migration, as beta data is disposable, but every document keeps its
// original request payload, so a new generation could be refilled from it.
export const DATA_GENERATION = 2
