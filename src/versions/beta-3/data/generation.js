// The generation of this version's stored data: one number for all of its
// collections (`beta-3-g<N>-*`), so they always change together. Bump it for
// any change to a schema in schemas/ other than to a title or description,
// and any change to its indexes: until then the service refuses to start (see
// syncDataSchemas). On its next boot it starts on new, empty collections. The
// old generation's are left behind, not dropped. There is no migration — beta
// data is disposable.
export const DATA_GENERATION = 1
