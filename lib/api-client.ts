'use client';

import { getSupabaseBrowser } from './supabase-browser';

export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new ApiClientError('No hay una sesión activa.', 401);
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    throw new ApiClientError(payload.error || 'La solicitud no pudo completarse.', response.status);
  }

  return payload;
}
