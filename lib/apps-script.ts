import 'server-only';

import { createHmac, randomUUID } from 'node:crypto';

export type AppsScriptResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  oldValues?: unknown;
};

export async function callAppsScript<T = unknown>(payload: Record<string, unknown>): Promise<AppsScriptResponse<T>> {
  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;

  if (!url || !secret) {
    throw new Error('La integración con Apps Script todavía no está configurada.');
  }

  const timestamp = Date.now().toString();
  const nonce = randomUUID();
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest('hex');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp, nonce, body, signature }),
    cache: 'no-store',
  });

  const result = (await response.json().catch(() => null)) as AppsScriptResponse<T> | null;

  if (!response.ok || !result) {
    throw new Error(`Apps Script respondió con HTTP ${response.status}.`);
  }

  if (!result.ok) {
    throw new Error(result.error || 'Apps Script rechazó la solicitud.');
  }

  return result;
}
