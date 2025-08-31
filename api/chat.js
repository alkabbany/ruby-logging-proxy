// =========================
// 1. Imports (top of file)
// =========================
import fs from "fs";
import path from "path";

// =========================
// 2. Context helpers
// =========================
function pickDocs(q) {
  const t = (q || "").toLowerCase();
  const docs = [];
  if (/(mahmeya)/.test(t)) docs.push("Mahmeya.md");
  if (/(diamond\s*gate|prime\s*stays)/.test(t)) docs.push("DiamondGate.md");
  if (/(share\b|sponsorship|media)/.test(t)) docs.push("Share.md");
  if (/(compete|sports|tournament|academy)/.test(t)) docs.push("Compete.md");
  return docs;
}

function readDocs(files) {
  return files
    .map((f) =>
      fs.readFileSync(path.join(process.cwd(), "knowledge", f), "utf8")
    )
    .join("\n\n---\n\n");
}

// =========================
// 3. Request handler
// =========================
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
  try {
    body =
      typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch {}
  const { sessionId, userAlias = "guest", message = "", consent = false } =
    body || {};
  if (!message || !sessionId) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing message or sessionId" });
  }

  // ---- Base Ruby system prompt
  const RUBY_PROMPT =
    process.env.RUBY_SYSTEM_PROMPT ||
    `
You are Ruby, SafeHouse Club’s business development assistant.
Be clear, factual, and persuasive. Always use SafeHouse Club's provided Company Context when available.
  `.trim();

  // ---- Company Context (Context Packs)
  const docNames = pickDocs(message);
  let DOC_CONTEXT = "";
  if (docNames.length) {
    try {
      DOC_CONTEXT = readDocs(docNames);
    } catch (err) {
      console.error("readDocs failed:", err);
    }
  }

  const MAX_CONTEXT_CHARS = 12000;
  if (DOC_CONTEXT.length > MAX_CONTEXT_CHARS) {
    DOC_CONTEXT =
      DOC_CONTEXT.slice(0, MAX_CONTEXT_CHARS) +
      "\n\n[Context truncated for length]\n";
  }

  const SYSTEM_PROMPT = [
    RUBY_PROMPT,
    "When Company Context is present, prioritize it over general knowledge. If a requested fact is not in the context, say so briefly.",
    DOC_CONTEXT ? `### Company Context\n${DOC_CONTEXT}\n### End Context` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // ---- Call OpenAI API
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey)
    return res
      .status(500)
      .json({ ok: false, error: "Missing OPENAI_API_KEY" });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  let assistant = "";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
    });
    const data = await r.json();
    assistant = data?.choices?.[0]?.message?.content ?? "";
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ ok: false, error: "OpenAI error", details: data });
    }
  } catch (e) {
    return res
      .status(502)
      .json({ ok: false, error: "OpenAI request failed", details: String(e) });
  }

  // ---- Log to your Vercel proxy (skip if no consent)
  let logResult = { tried: false };
  if (consent === true) {
    const logUrl = process.env.LOG_URL; // e.g. https://ruby-logging-proxy.vercel.app/api/log
    const logKey = process.env.LOG_API_KEY; // same secret you set on the proxy
    if (!logUrl || !logKey) {
      logResult = {
        tried: true,
        ok: false,
        error: "Missing LOG_URL or LOG_API_KEY",
      };
    } else {
      try {
        const payload = {
          session_id: sessionId,
          user_alias: userAlias,
          consent: true,
          messages: [
            { role: "user", text: message },
            { role: "assistant", text: assistant },
          ],
          meta: { topic: "Ruby Chat", tags: ["ruby", "chat"] },
        };
        const lr = await fetch(logUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": logKey,
          },
          body: JSON.stringify(payload),
        });
        const lj = await lr.json().catch(() => ({}));
        logResult = {
          tried: true,
          ok: lr.ok && !!lj?.ok,
          status: lr.status,
          body: lj,
        };
      } catch (e) {
        logResult = { tried: true, ok: false, error: String(e) };
      }
    }
  }

  // ---- Return chat reply (and log status for debugging the UI)
  return res.status(200).json({
    ok: true,
    reply: assistant,
    log: logResult,
  });
}
