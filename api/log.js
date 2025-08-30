// api/log.js — Vercel proxy to Apps Script (ESM)
async function postJSON(url, body, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, text, json };
  } finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.LOG_API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized (bad or missing X-API-Key)' });
  }

  const scriptUrl = process.env.APPS_SCRIPT_URL;
  if (!scriptUrl) return res.status(500).json({ ok: false, error: 'Missing APPS_SCRIPT_URL' });

  let input = {};
  try {
    if (typeof req.body === 'object' && req.body) input = req.body;
    else if (typeof req.body === 'string' && req.body.trim()) input = JSON.parse(req.body);
  } catch {}

  const consent = input?.consent === true || String(input?.consent).toLowerCase() === 'true';
  if (!consent) return res.status(200).json({ ok: true, skipped: 'no-consent' });

  const payload = {
    session_id: input?.session_id ?? 'anon',
    user_alias: input?.user_alias ?? 'guest',
    consent: true,
    messages: Array.isArray(input?.messages) ? input.messages : [],
    meta: input?.meta ?? { via: 'vercel-proxy' }
  };

  const timeout = Number(process.env.TIMEOUT_MS ?? 5000);
  try {
    const up = await postJSON(scriptUrl, payload, timeout);
    return res.status(up.ok ? 200 : 502).json({
      ok: !!up.ok,
      upstream_status: up.status,
      upstream_json: up.json ?? up.text
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Upstream call failed', detail: String(e) });
  }
}
