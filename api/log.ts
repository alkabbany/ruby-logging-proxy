// api/log.ts — Vercel Serverless Function (TypeScript)
// Accepts JSON from Ruby and relays to Google Apps Script Web App.
// Adds: API key check, CORS, input normalization, retries, and clear responses.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ORIGINS = ['*']; // or list your domains e.g., ['https://chat.openai.com', 'https://yourapp.com']

// ENV VARS you set in Vercel
// LOG_API_KEY:        your shared secret to protect this endpoint
// APPS_SCRIPT_URL:    https://script.google.com/macros/s/AKfycb.../exec  (clean /exec URL)
// TIMEOUT_MS:         optional, default 5000

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', ORIGINS.includes('*') ? '*' : ORIGINS.join(','));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
}

async function postJSON(url: string, body: any, timeoutMs = 5000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal
    });
    const text = await r.text(); // Apps Script always returns text; may be JSON
    let json: any = undefined;
    try { json = JSON.parse(text); } catch { /* keep raw text */ }
    return { ok: r.ok, status: r.status, text, json };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // API key check
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.LOG_API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const scriptUrl = process.env.APPS_SCRIPT_URL;
  if (!scriptUrl) {
    return res.status(500).json({ ok: false, error: 'Missing APPS_SCRIPT_URL' });
  }

  // Normalize incoming body (be lenient so GPT can send anything)
  const now = new Date().toISOString();
  const body = typeof req.body === 'object' ? req.body : {};
  const consent =
    body?.consent === true || String(body?.consent).toLowerCase() === 'true';

  // If no consent, return success but skip forwarding
  if (!consent) {
    return res.status(200).json({ ok: true, skipped: 'no-consent', ts: now });
  }

  // Minimal normalized payload we forward to Apps Script (your existing handler accepts anything)
  const payload = {
    session_id: body?.session_id ?? 'anon',
    user_alias: body?.user_alias ?? 'guest',
    consent: true,
    messages: Array.isArray(body?.messages) ? body.messages : [],
    meta: body?.meta ?? { via: 'vercel-proxy' }
  };

  const timeout = Number(process.env.TIMEOUT_MS ?? 5000);

  // Try up to 2 attempts (Apps Script can be spiky)
  const first = await postJSON(scriptUrl, payload, timeout);
  if (!first.ok) {
    const second = await postJSON(scriptUrl, payload, timeout);
    const best = second.ok ? second : first;
    return res.status(best.ok ? 200 : 502).json({
      ok: !!best.ok,
      attempt: best === second ? 2 : 1,
      upstream_status: best.status,
      upstream_json: best.json ?? best.text
    });
  }

  return res.status(200).json({
    ok: true,
    upstream_status: first.status,
    upstream_json: first.json ?? first.text
  });
}
