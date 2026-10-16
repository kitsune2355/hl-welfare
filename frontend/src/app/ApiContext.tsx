import { createContext, use, useMemo, type ReactNode } from 'react';
import type { WelfareApi } from '../application/ports';
import { createApi, type ApiMode } from '../infrastructure/createApi';

interface ApiCtx {
  api: WelfareApi;
  mode: ApiMode;
}

const ApiContext = createContext<ApiCtx | null>(null);

/** Composition root: เลือก adapter จาก .env แล้วฉีดให้ทุกหน้าผ่าน useApi() */
export function ApiProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ApiCtx>(() => {
    const mode: ApiMode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';
    return { mode, api: createApi(mode, import.meta.env.VITE_API_BASE_URL ?? '/api') };
  }, []);
  return <ApiContext value={value}>{children}</ApiContext>;
}

export function useApi(): ApiCtx {
  const c = use(ApiContext);
  if (!c) throw new Error('ApiProvider missing');
  return c;
}
