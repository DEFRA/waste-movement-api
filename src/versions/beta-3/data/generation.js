// The generation of this version's stored data: one number for all of its
// collections (`beta-3-g<N>-*`), so they always change together. Bump it when
// the stored shape changes in a way the code can no longer read, e.g. a field
// renamed or moved: on its next boot the service starts on new, empty
// collections and drops the old generation's. There is no migration — beta
// data is disposable.
export const DATA_GENERATION = 1
