// Hash asosidagi router. resolve() sof funksiya, testlanadi.
export const DEFAULT_ROUTE = 'bosh';

export function resolve(hash, routes) {
  const id = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return Object.prototype.hasOwnProperty.call(routes, id) ? id : DEFAULT_ROUTE;
}

export function createRouter({ routes, onChange }) {
  const go = () => { const id = resolve(location.hash, routes); onChange(id, routes[id]); };
  window.addEventListener('hashchange', go);
  return { start: go };
}
