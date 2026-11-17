import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

/** The snapshot keeps positions in a Map, which JSON can't hold on its own. */
function replacer(_key: string, value: unknown) {
  return value instanceof Map ? { __map: [...value.entries()] } : value;
}

function reviver(_key: string, value: unknown) {
  return value && typeof value === 'object' && '__map' in value ? new Map((value as { __map: [unknown, unknown][] }).__map) : value;
}

/**
 * Keeps the last-loaded board in localStorage, so the installed app opens with it at once and
 * still shows it offline. Search results aren't kept.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createSyncStoragePersister({
    storage: window.localStorage,
    key: 'board-cache',
    serialize: (data) => JSON.stringify(data, replacer),
    deserialize: (text) => JSON.parse(text, reviver),
  }),
  // Also the query gcTime, so it has to stay under setTimeout's limit of about 24.8 days.
  maxAge: 1000 * 60 * 60 * 24 * 7,
  buster: 'v1',
  dehydrateOptions: { shouldDehydrateQuery: (query) => query.queryKey[0] === 'snapshot' && query.state.status === 'success' },
};
