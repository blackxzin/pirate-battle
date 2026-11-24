import { useSyncExternalStore } from 'react';

export type Route = 'menu' | 'options' | 'play' | 'result' | 'ranking' | 'history';

const ROUTE_PATHS: Record<Route, string> = {
  menu: '#/',
  options: '#/options',
  play: '#/play',
  result: '#/result',
  ranking: '#/log/ranking',
  history: '#/log/history',
};

export function parseRoute(hash: string): Route {
  const match = (Object.entries(ROUTE_PATHS) as Array<[Route, string]>).find(([, path]) => path === hash);
  return match ? match[0] : 'menu';
}

export function navigate(route: Route, options: { readonly replace?: boolean } = {}): void {
  const path = ROUTE_PATHS[route];
  if (window.location.hash === path) return;
  if (options.replace) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${path}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path;
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash));
}
