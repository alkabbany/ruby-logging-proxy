// api/log.js — minimal health check in CommonJS (no TypeScript, no imports)

module.exports = async (req, res) => {
  // CORS (harmless even if not needed)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed', method: req.method });
  }

  // Parse body defensively (PowerShell sends JSON fine; this just avoids crashes)
  let body = {};
  try {
    if (typeof req.body === 'object' && req.body !== null) body = req.body;
    else if (typeof req.body === 'string' && req.body.trim()) body = JSON.parse(req.body);
  } catch (_) {/* ignore */}

  return res.status(200).json({ ok: true, echo: body, ts: new Date().toISOString() });
};
