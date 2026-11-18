import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import { persistOptions } from './data/persist.ts';
import { AppearanceProvider } from './lib/appearance.tsx';
import './index.css';

// Dev-only, so production builds leave the design screens and seed data out.
const DesignApp = import.meta.env.DEV ? lazy(() => import('./design/design-app.tsx').then((m) => ({ default: m.DesignApp }))) : null;

const path = window.location.pathname;
// Kept as long as the persisted copy, so the last-loaded board survives a restart offline.
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1, gcTime: persistOptions.maxAge } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AppearanceProvider>
        <TooltipProvider>
          {DesignApp && path.startsWith('/design') ? (
            <Suspense>
              <DesignApp screen={path.split('/')[2] ?? ''} />
            </Suspense>
          ) : (
            <App />
          )}
        </TooltipProvider>
      </AppearanceProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
