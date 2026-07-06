// lib/db.js — the "database", wearing two different hats depending on where it's running.
// Locally: just a JSON file, like before. On Vercel: Upstash Redis (Vercel's current
// recommended key-value store — Vercel KV got deprecated and folded into this), because
// Vercel's filesystem forgets everything the second a request finishes.
// TODO: if this ever outgrows a single JSON blob (like, actual reporting/analytics), swap for real Postgres.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "db.json");
const KEY = "orderdeck_db";

// These env vars only show up once you've connected an Upstash Redis integration in the
// Vercel dashboard. If they're missing, assume we're running locally and use the file instead.
const usingRedis = !!process.env.KV_REST_API_URL;

let redis;
if (usingRedis) {
  const { Redis } = require("@upstash/redis");
  redis = Redis.fromEnv();
}

const emptyDB = { users: [], orders: [], stock: [] };

async function loadDB() {
  if (usingRedis) {
    const data = await redis.get(KEY);
    return data || emptyDB;
  }
  if (!fs.existsSync(DB_PATH)) return emptyDB;
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

async function saveDB(data) {
  if (usingRedis) {
    await redis.set(KEY, data);
  } else {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }
}

module.exports = { loadDB, saveDB };

