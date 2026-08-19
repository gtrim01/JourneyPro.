/* ============================================================
   JourneyPro Community API — v1
   One serverless function: traveller notes + road reports.
   Zero npm dependencies — talks straight to Upstash Redis
   over REST using the env vars Vercel's Storage tab injects.

   GET  /api/community?stop=<id>
     -> { ok, reviews: [...], reports: [...] }
   POST /api/community
     { stop, type: "review"|"report", handle,
       rating?, text?, kind? }
     -> { ok } | { ok:false, error }

   Set the env var COMMUNITY_OFF=1 in Vercel to switch the
   whole layer off instantly (kill-switch).
   ============================================================ */

const REDIS_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const KINDS = ["closed", "water", "works", "fuel", "clear"];
const MAX_TEXT = 280;
const MAX_REPORT_TEXT = 120;
const MAX_HANDLE = 24;
const KEEP = 50; /* most recent entries kept per stop */
const RATE_LIMIT = 10; /* writes per IP per hour */

async function redis(commands) {
  const res = await fetch(REDIS_URL + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error("redis " + res.status);
  return res.json();
}

const clean = (s, max) =>
  String(s || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const validStop = (s) => /^[a-z]{2,32}$/.test(String(s || ""));

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (process.env.COMMUNITY_OFF) {
    return res.status(503).json({ ok: false, error: "community-off" });
  }
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ ok: false, error: "not-configured" });
  }

  try {
    if (req.method === "GET") {
      const stop = String((req.query && req.query.stop) || "");
      if (!validStop(stop)) {
        return res.status(400).json({ ok: false, error: "bad-stop" });
      }
      const out = await redis([
        ["LRANGE", "rv:" + stop, "0", "19"],
        ["LRANGE", "rp:" + stop, "0", "19"],
      ]);
      const parse = (arr) =>
        (arr || [])
          .map((s) => {
            try { return JSON.parse(s); } catch (e) { return null; }
          })
          .filter(Boolean);
      return res.status(200).json({
        ok: true,
        reviews: parse(out[0] && out[0].result),
        reports: parse(out[1] && out[1].result),
      });
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      body = body || {};

      const stop = String(body.stop || "");
      const type = body.type === "report" ? "report" : "review";
      if (!validStop(stop)) {
        return res.status(400).json({ ok: false, error: "bad-stop" });
      }

      /* simple hourly rate limit per IP */
      const ip =
        (req.headers["x-forwarded-for"] || "anon").toString().split(",")[0].trim();
      const rl = await redis([
        ["INCR", "rl:" + ip],
        ["EXPIRE", "rl:" + ip, "3600"],
      ]);
      const count = Number(rl[0] && rl[0].result) || 0;
      if (count > RATE_LIMIT) {
        return res.status(429).json({ ok: false, error: "slow-down" });
      }

      const handle = clean(body.handle, MAX_HANDLE) || "Traveller";
      const d = new Date().toISOString().slice(0, 10);
      let key, entry;

      if (type === "review") {
        const rating = Math.max(0, Math.min(5, Math.round(Number(body.rating) || 0)));
        const text = clean(body.text, MAX_TEXT);
        if (!rating && !text) {
          return res.status(400).json({ ok: false, error: "empty" });
        }
        key = "rv:" + stop;
        entry = { h: handle, r: rating || undefined, t: text || undefined, d };
      } else {
        const kind = KINDS.includes(body.kind) ? body.kind : null;
        const text = clean(body.text, MAX_REPORT_TEXT);
        if (!kind) {
          return res.status(400).json({ ok: false, error: "bad-kind" });
        }
        key = "rp:" + stop;
        entry = { h: handle, k: kind, t: text || undefined, d };
      }

      await redis([
        ["LPUSH", key, JSON.stringify(entry)],
        ["LTRIM", key, "0", String(KEEP - 1)],
      ]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "method" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "server" });
  }
}
