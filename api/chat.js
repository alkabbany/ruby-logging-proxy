// api/chat.js — serverless chat handler (OpenAI + log to your Vercel proxy)
export default async function handler(req, res) {
  // CORS (so you can open index.html from anywhere)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // ---- Parse input
  let body = {};
  try { body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}"); }
  catch {}
  const { sessionId, userAlias = "guest", message = "", consent = false } = body || {};
  if (!message || !sessionId) {
    return res.status(400).json({ ok: false, error: "Missing message or sessionId" });
  }

  // ---- Ruby system prompt (paste your full instruction set here if you want)
  const RUBY_PROMPT = process.env.RUBY_SYSTEM_PROMPT || `
You are Ruby, SafeHouse Club’s business development assistant.
Be clear, factual, and persuasive. (Short version here — you can paste your full prompt in RUBY_SYSTEM_PROMPT.)
  `.trim();

  // ---- Call OpenAI API
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY" });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  let assistant = "";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: RUBY_PROMPT },
          { role: "user", content: message }
        ]
      })
    });
    const data = await r.json();
    assistant = data?.choices?.[0]?.message?.content ?? "";
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: "OpenAI error", details: data });
    }
  } catch (e) {
    return res.status(502).json({ ok: false, error: "OpenAI request failed", details: String(e) });
  }

  // ---- Log to your Vercel proxy (skip if no consent)
  let logResult = { tried: false };
  if (consent === true) {
    const logUrl = process.env.LOG_URL;        // e.g. https://ruby-logging-proxy.vercel.app/api/log
    const logKey = process.env.LOG_API_KEY;    // same secret you set on the proxy
    if (!logUrl || !logKey) {
      // Don’t block the reply if logging isn’t configured
      logResult = { tried: true, ok: false, error: "Missing LOG_URL or LOG_API_KEY" };
    } else {
      try {
        const payload = {
          session_id: sessionId,
          user_alias: userAlias,
          consent: true,
          messages: [
            { role: "user", text: message },
            { role: "assistant", text: assistant }
          ],
          meta: { topic: "Ruby Chat", tags: ["ruby", "chat"] }
        };
        const lr = await fetch(logUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": logKey },
          body: JSON.stringify(payload)
        });
        const lj = await lr.json().catch(() => ({}));
        logResult = { tried: true, ok: lr.ok && !!lj?.ok, status: lr.status, body: lj };
      } catch (e) {
        logResult = { tried: true, ok: false, error: String(e) };
      }
    }
  }

  // ---- Return chat reply (and a little log status for debugging the UI)
  return res.status(200).json({
    ok: true,
    reply: assistant,
    log: logResult
  });
}
