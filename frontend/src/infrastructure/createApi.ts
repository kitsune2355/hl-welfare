import type { WelfareApi } from '../application/ports';
import { HttpApi } from './http/httpApi';
import { MockApi } from './mock/mockApi';

export type ApiMode = 'mock' | 'http';

export function createApi(mode: ApiMode, baseUrl = '/api'): WelfareApi {
  return mode === 'http' ? new HttpApi(baseUrl) : new MockApi();
}
