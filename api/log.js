// api/log.js — ESM minimal health handler
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res
    .status(200)
    .end(JSON.stringify({ ok: true, method: req.method, ts: new Date().toISOString() }));
}
