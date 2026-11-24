/**
 * URL of a file in `public/assets`, relative to the deployment base
 * (`/` locally, a sub-path such as `/pirate-battle/` on GitHub Pages).
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}
