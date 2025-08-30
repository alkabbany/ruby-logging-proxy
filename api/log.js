// api/log.js — minimal cannot crash
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res
    .status(200)
    .end(JSON.stringify({ ok: true, method: req.method, ts: new Date().toISOString() }));
};
