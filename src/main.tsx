import { startAccount } from './account';
import './style.css';

// Load a signed-in person's account before any store reads localStorage, so the app opens with their data.
// Everything else is imported afterwards for that reason.
await startAccount();
const [{ default: React }, { default: ReactDOM }, { QueryClient }, { PersistQueryClientProvider }, { createSyncStoragePersister }, { ReactQueryDevtools }, { ApiError, isDemo }, { default: App }] = await Promise.all([
  import('react'), import('react-dom/client'), import('@tanstack/react-query'), import('@tanstack/react-query-persist-client'),
  import('@tanstack/query-sync-storage-persister'), import('@tanstack/react-query-devtools'), import('./api'), import('./App'),
]);
const DAY = 24 * 60 * 60 * 1000;
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 60 * 1000, gcTime: DAY, refetchOnWindowFocus: false, retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1 } } });
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* private mode */ }
const persister = createSyncStoragePersister({ storage, key: 'devflix-cache-v1', throttleTime: 1000 });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: DAY, buster: isDemo ? 'demo-v3' : 'live-v3' }}><App/><ReactQueryDevtools initialIsOpen={false}/></PersistQueryClientProvider></React.StrictMode>);
