// The shape of the records this version stores. Bump it when that shape
// changes in a way the code can no longer read, e.g. a field renamed or
// moved: on its next boot the service starts on new, empty collections
// (`beta-3-r<N>-*`) and drops the old revision's. There is no migration — beta
// data is disposable.
export const DATA_REVISION = 1
