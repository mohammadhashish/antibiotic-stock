// Shared stock data API.
// GET  /api/stock            -> latest snapshot + previous rows + upload history
// GET  /api/stock?snap=<id>  -> one historic snapshot
// POST /api/stock            -> save a new snapshot (requires x-admin-pin header)
//      body { rows, source, note }  or  { checkOnly: true }
import { put, list, get } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import seed from "../lib/seed.js";

const PREFIX = "stock/snap-";
const MAX_ROWS = 3000;

function send(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

function pinOk(given) {
  const real = process.env.ADMIN_PIN || "";
  if (!real || typeof given !== "string") return false;
  const a = Buffer.from(given.trim().toUpperCase());
  const b = Buffer.from(real.trim().toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) return null;
  const out = [];
  for (const r of rows) {
    if (!Array.isArray(r)) return null;
    const name = String(r[0] ?? "").trim().slice(0, 160);
    if (!name) continue;
    const bal = Math.max(0, Number(r[1]) || 0);
    const rate = Math.max(0, Number(r[2]) || 0);
    out.push([name, bal, rate]);
  }
  return out.length ? out : null;
}

// Newest snapshots sort first because the key is a reversed timestamp.
function keyFor(ts) {
  return PREFIX + String(9999999999999 - ts).padStart(13, "0") + ".json";
}

async function listSnaps(limit = 30) {
  const { blobs } = await list({ prefix: PREFIX, limit });
  return blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

async function readBlob(pathname) {
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || !r.stream) throw new Error("blob read failed");
  return new Response(r.stream).json();
}

export default async function handler(req, res) {
  try {
    const hasStore = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

    if (req.method === "GET") {
      if (!hasStore) return send(res, 200, { current: seed, previous: null, history: [], storage: false });
      const snaps = await listSnaps(30);
      const snapId = req.query && req.query.snap;
      if (snapId) {
        const hit = snaps.find((b) => b.pathname === snapId);
        if (!hit) return send(res, 404, { error: "not_found" });
        return send(res, 200, { snapshot: await readBlob(hit.pathname) });
      }
      if (!snaps.length) return send(res, 200, { current: seed, previous: null, history: [], storage: true });
      const current = await readBlob(snaps[0].pathname);
      let previous = null;
      if (snaps[1]) { try { previous = (await readBlob(snaps[1].pathname)).rows; } catch (e) {} }
      const history = snaps.map((b) => ({ id: b.pathname, at: b.uploadedAt }));
      return send(res, 200, { current, previous, history, storage: true });
    }

    if (req.method === "POST") {
      const pin = req.headers["x-admin-pin"];
      if (!pinOk(pin)) {
        await new Promise((r) => setTimeout(r, 900)); // slow down guessing
        return send(res, 401, { error: "bad_pin" });
      }
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
      if (body && body.checkOnly) return send(res, 200, { ok: true, storage: hasStore });
      if (!hasStore) return send(res, 503, { error: "no_storage" });
      const rows = cleanRows(body && body.rows);
      if (!rows) return send(res, 400, { error: "bad_rows" });
      const now = Date.now();
      const snap = {
        rows,
        updated: new Date(now).toISOString(),
        source: String((body && body.source) || "manual edit").slice(0, 160),
        note: String((body && body.note) || "").slice(0, 300)
      };
      await put(keyFor(now), JSON.stringify(snap), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json"
      });
      return send(res, 200, { ok: true, current: snap });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "method" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "server", detail: String(err && err.message || err) });
  }
}
