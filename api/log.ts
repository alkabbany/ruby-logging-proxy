// api/log.ts (temporary health check)
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = typeof req.body === 'object' ? req.body : {};
  return res.status(200).json({ ok: true, echo: body, ts: new Date().toISOString() });
}
