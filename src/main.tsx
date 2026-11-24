import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MatchSyncProvider } from './api/MatchSyncProvider';
import { createQueryClient } from './api/queries';
import { sound } from './audio/sound';
import { startMockApi } from './mocks/browser';
import { loadOptions } from './storage/preferences';
import { App } from './ui/App';
import { navigate, parseRoute } from './ui/router';
import './ui/styles.css';

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root not found');

  // A refresh during combat abandons the match: never resume on the play route.
  if (parseRoute(window.location.hash) === 'play') navigate('menu', { replace: true });

  sound.setEnabled(loadOptions().soundEnabled);
  await startMockApi();

  const queryClient = createQueryClient();
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MatchSyncProvider>
          <App />
        </MatchSyncProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start Pirate Battle', error);
});
