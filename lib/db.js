const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "db.json");
const KEY = "orderdeck_db";

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
