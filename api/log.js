// api/log.js — ESM echo
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).end(JSON.stringify({ ok: true, method: 'GET' }));
  if (req.method !== 'POST') return res.status(405).end(JSON.stringify({ ok: false, error: 'Method not allowed' }));

  let body = {};
  try {
    if (typeof req.body === 'object' && req.body) body = req.body;
    else if (typeof req.body === 'string' && req.body.trim()) body = JSON.parse(req.body);
  } catch {}

  return res.status(200).end(JSON.stringify({ ok: true, echo: body }));
}
