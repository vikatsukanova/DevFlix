import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ApiError, isDemo } from './api';
import App from './App';
import './style.css';
const DAY = 24 * 60 * 60 * 1000;
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 60 * 1000, gcTime: DAY, refetchOnWindowFocus: false, retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1 } } });
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* private mode */ }
const persister = createSyncStoragePersister({ storage, key: 'devflix-cache-v1', throttleTime: 1000 });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: DAY, buster: isDemo ? 'demo-v1' : 'live-v1' }}><App/><ReactQueryDevtools initialIsOpen={false}/></PersistQueryClientProvider></React.StrictMode>);
