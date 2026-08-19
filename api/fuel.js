/* ============================================================
   JourneyPro Live Fuel API — v1
   GET /api/fuel?state=WA&town=Broome&fuel=diesel
     -> { ok, state, town, fuel, min, avg, n, asOf, src }
        (min/avg in cents per litre)

   Sources:
   · WA  — FuelWatch RSS, no key needed. Prices are fixed
           daily under WA's 24-hour rule, so CDN caching for
           an hour is honest.
   · NSW & TAS — FuelCheck API, activates automatically once
           NSW_FUEL_APIKEY + NSW_FUEL_SECRET env vars exist
           (register at api.nsw.gov.au, subscribe to the Fuel
           API, then add the key/secret in Vercel → redeploy).
   · Other states -> { ok:false, error:"coming-soon" }.

   Zero npm dependencies.
   ============================================================ */

const WA_PRODUCT = { diesel: 4, u91: 1, p95: 2 };
const NSW_FUEL = { diesel: "DL", u91: "U91", p95: "P95" };
const LIVE_STATES = ["WA", "NSW", "TAS"];

function parseFuelwatchRSS(xml) {
  const prices = [];
  const re = /<price>([\d.]+)<\/price>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const p = parseFloat(m[1]);
    if (p > 50 && p < 500) prices.push(p); /* cents per litre sanity window */
  }
  return prices;
}

function summarise(prices) {
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return { min: Math.round(min * 10) / 10, avg: Math.round(avg * 10) / 10, n: prices.length };
}

async function fetchWA(town, fuel) {
  const product = WA_PRODUCT[fuel];
  const base = "https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS?Product=" + product +
    "&Day=today&Suburb=" + encodeURIComponent(town);
  /* exact town first; widen to surrounding if the town itself has no listings */
  for (const surrounding of ["no", "yes"]) {
    const res = await fetch(base + "&Surrounding=" + surrounding, {
      headers: { "User-Agent": "JourneyPro/1.0 (travel planner; fuel price display)" },
    });
    if (!res.ok) continue;
    const xml = await res.text();
    const s = summarise(parseFuelwatchRSS(xml));
    if (s) return { ...s, src: "FuelWatch WA" + (surrounding === "yes" ? " (nearby)" : "") };
  }
  return null;
}

/* token cached in module scope — survives while the lambda stays warm */
let nswToken = null, nswTokenExp = 0;

async function nswAccessToken(key, secret) {
  if (nswToken && Date.now() < nswTokenExp - 60000) return nswToken;
  const res = await fetch("https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials", {
    headers: { Authorization: "Basic " + Buffer.from(key + ":" + secret).toString("base64") },
  });
  if (!res.ok) throw new Error("nsw-auth " + res.status);
  const data = await res.json();
  nswToken = data.access_token;
  nswTokenExp = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return nswToken;
}

async function fetchNSW(town, fuel, state) {
  const key = process.env.NSW_FUEL_APIKEY, secret = process.env.NSW_FUEL_SECRET;
  if (!key || !secret) return { notConfigured: true };
  const token = await nswAccessToken(key, secret);
  const now = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  const h12 = now.getUTCHours() % 12 || 12;
  const ts = pad(now.getUTCDate()) + "/" + pad(now.getUTCMonth() + 1) + "/" + now.getUTCFullYear() +
    " " + pad(h12) + ":" + pad(now.getUTCMinutes()) + ":" + pad(now.getUTCSeconds()) +
    " " + (now.getUTCHours() >= 12 ? "PM" : "AM");
  const res = await fetch("https://api.onegov.nsw.gov.au/FuelPriceCheck/v2/fuel/prices/location", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: "Bearer " + token,
      transactionid: String(Date.now()),
      requesttimestamp: ts,
    },
    body: JSON.stringify({
      fueltype: NSW_FUEL[fuel],
      namedlocation: town,
      sortby: "price",
      sortascending: "true",
    }),
  });
  if (!res.ok) throw new Error("nsw-prices " + res.status);
  const data = await res.json();
  const prices = ((data && data.prices) || [])
    .map((p) => parseFloat(p.price))
    .filter((p) => p > 50 && p < 500);
  const s = summarise(prices);
  return s ? { ...s, src: "FuelCheck " + state } : null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method" });

  const q = req.query || {};
  const state = String(q.state || "").toUpperCase();
  const town = String(q.town || "").replace(/[^A-Za-z' -]/g, "").trim().slice(0, 40);
  const fuel = ["diesel", "u91", "p95"].includes(q.fuel) ? q.fuel : "diesel";

  if (!LIVE_STATES.includes(state)) {
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({ ok: false, error: "coming-soon", state });
  }
  if (town.length < 2) return res.status(400).json({ ok: false, error: "bad-town" });

  try {
    let out = null;
    if (state === "WA") {
      out = await fetchWA(town, fuel);
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=21600");
    } else {
      out = await fetchNSW(town, fuel, state);
      if (out && out.notConfigured) {
        res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
        return res.status(200).json({ ok: false, error: "coming-soon", state });
      }
      res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=7200");
    }
    if (!out) {
      return res.status(200).json({ ok: false, error: "no-listings", state, town });
    }
    return res.status(200).json({
      ok: true, state, town, fuel,
      min: out.min, avg: out.avg, n: out.n,
      asOf: new Date().toISOString().slice(0, 10),
      src: out.src,
    });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=120");
    return res.status(200).json({ ok: false, error: "upstream", state });
  }
};

module.exports.parseFuelwatchRSS = parseFuelwatchRSS;
module.exports.summarise = summarise;
