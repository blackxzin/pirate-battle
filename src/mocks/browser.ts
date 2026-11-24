import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { applyScenarioFromUrl } from './scenarios';

/**
 * Starts the MSW service worker. Mocks run in every build (including the
 * deployed one) because ranking/history have no real backend. A failure is
 * reported but never blocks the game: the API layer surfaces the errors.
 */
export async function startMockApi(): Promise<boolean> {
  applyScenarioFromUrl(window.location.search);
  try {
    const worker = setupWorker(...handlers);
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    });
    return true;
  } catch (error: unknown) {
    console.warn('Mock API could not start; ranking and history will be unavailable.', error);
    return false;
  }
}
