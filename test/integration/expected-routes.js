// The declared set of routes this service exposes.
//
// A new route lands here deliberately, not automatically: route-coverage.test.js
// fails until someone adds it, closing the one real risk of the explicit
// per-endpoint style used by the rest of this suite.
export const expectedRoutes = [
  { method: 'get', path: '/health' },
  { method: 'post', path: '/beta-3/movements' },
  { method: 'post', path: '/beta-3/movements/{movementId}/collection' },
  { method: 'post', path: '/beta-3/deliveries' },
  { method: 'post', path: '/beta-3/deliveries/{deliveryId}/receipt' },
  { method: 'post', path: '/beta-3/receipts' }
]
