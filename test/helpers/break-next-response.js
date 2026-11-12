// Rewrites the body of the server's next successful response, after the
// handler but before Hapi's response validation (onPostHandler runs between
// the two). For proving a route's `response.status` schema is enforced when
// no service stub can make the handler itself return a bad body.
export const breakNextResponse = (server, mutate) => {
  let armed = true

  server.ext('onPostHandler', (request, h) => {
    if (armed && !request.response.isBoom) {
      armed = false
      request.response.source = mutate(request.response.source)
    }
    return h.continue
  })
}
