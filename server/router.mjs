import { ROUTES } from './routes-manifest.mjs';

function splitPath(pathname) {
  return String(pathname || '/').split('?')[0].split('/').filter(Boolean);
}

export function matchRoute(method, pathname, routes = ROUTES) {
  const input = splitPath(pathname);
  const wantedMethod = String(method || '').toUpperCase();
  for (const route of routes) {
    if (route.method !== wantedMethod) continue;
    const pattern = splitPath(route.path);
    if (pattern.length !== input.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < pattern.length; i += 1) {
      const part = pattern[i];
      if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(input[i]);
      else if (part !== input[i]) { matched = false; break; }
    }
    if (matched) return { route, params };
  }
  return null;
}
