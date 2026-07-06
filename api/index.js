// api/index.js — same brain as before, just re-wired to survive on Vercel's
// "spin up, answer one request, disappear" style of running code.
// This file gets exported as-is; Vercel treats an Express app as a valid handler.

const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const { loadDB, saveDB } = require("../lib/db");

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "yeetSecretDoNotDeployToTheMoonWithThis";
if (!process.env.JWT_SECRET) {
  console.log("⚠️  Using the default JWT secret. Fine for testing, set a real JWT_SECRET before this goes public.");
}

app.use(express.json());
app.use(cookieParser());
// only serve local static files when running locally — on Vercel, vercel.json handles /public directly
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, "..", "public")));
}

// seeding only needs to happen once ever — this flag just avoids re-checking KV on every warm request
let seeded = false;
async function ensureFounderSeeded() {
  if (seeded) return;
  const db = await loadDB();
  if (db.users.length === 0) {
    const defaultPass = "changeme123";
    db.users.push({
      id: "u_" + Date.now(),
      username: "founder",
      passwordHash: bcrypt.hashSync(defaultPass, 10),
      role: "founder",
    });
    await saveDB(db);
    console.log("👑 Founder account created — username: founder | password: changeme123");
  }
  seeded = true;
}
app.use(async (req, res, next) => {
  try {
    await ensureFounderSeeded();
    next();
  } catch (err) {
    next(err);
  }
});

// --- auth helpers: login state now lives inside a signed cookie, not server memory ---
function requireLogin(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "not logged in, who dis" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "session expired, log in again" });
  }
}
function requireFounder(req, res, next) {
  if (req.user?.role !== "founder") {
    return res.status(403).json({ error: "founder-only zone, nice try" });
  }
  next();
}
function cookieOptions() {
  return {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 12, // 12hr
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };
}

// ---------------- AUTH ROUTES ----------------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const db = await loadDB();
  const user = db.users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "wrong username or password" });
  }
  const payload = { id: user.id, username: user.username, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
  res.cookie("token", token, cookieOptions());
  res.json({ user: payload });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json({ user: null });
  try {
    res.json({ user: jwt.verify(token, JWT_SECRET) });
  } catch {
    res.json({ user: null });
  }
});

app.post("/api/change-password", requireLogin, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: "need both your old and new password" });
  if (newPassword.length < 6) return res.status(400).json({ error: "new password's gotta be 6+ characters" });
  const db = await loadDB();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return res.status(401).json({ error: "old password's wrong" });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  await saveDB(db);
  res.json({ ok: true });
});

// ---------------- USER MANAGEMENT (founder only) ----------------
app.get("/api/users", requireLogin, requireFounder, async (req, res) => {
  const db = await loadDB();
  res.json(db.users.map(({ passwordHash, ...safe }) => safe)); // never leak the hash, obviously
});

app.post("/api/users", requireLogin, requireFounder, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "need a username and password bro" });
  const db = await loadDB();
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: "that username's already taken" });
  }
  const newStaff = {
    id: "u_" + Date.now(),
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "staff", // founder can only spawn staff accounts, not other founders — one boss at a time
  };
  db.users.push(newStaff);
  await saveDB(db);
  const { passwordHash, ...safe } = newStaff;
  res.json(safe);
});

app.delete("/api/users/:id", requireLogin, requireFounder, async (req, res) => {
  const db = await loadDB();
  const target = db.users.find((u) => u.id === req.params.id);
  if (target?.role === "founder") return res.status(400).json({ error: "you can't delete the founder, that's you" });
  db.users = db.users.filter((u) => u.id !== req.params.id);
  await saveDB(db);
  res.json({ ok: true });
});

// ---------------- ORDERS ----------------
app.get("/api/orders", requireLogin, async (req, res) => {
  res.json((await loadDB()).orders);
});

app.post("/api/orders", requireLogin, async (req, res) => {
  const { customerName, items, address, paymentStatus, deliveryStatus, shippingPrice } = req.body;
  if (!customerName || !address) return res.status(400).json({ error: "need at least a name and address" });
  if (!items || items.length === 0) return res.status(400).json({ error: "pick at least one item from stock" });

  const db = await loadDB();

  // knock the ordered quantity off the actual stock — this is the whole point of linking orders to stock
  for (const line of items) {
    const stockItem = db.stock.find((s) => s.id === line.stockId);
    if (stockItem) {
      stockItem.quantity = Math.max(0, stockItem.quantity - line.qty); // never go below zero, just floor it
    }
  }

  const freshOrder = {
    id: "ord_" + Date.now(),
    customerName,
    items, // e.g. [{ stockId: "stk_123", name: "Blue Hoodie", qty: 2, price: 25 }]
    address,
    shippingPrice: Number(shippingPrice) || 0,
    paymentStatus: paymentStatus || "unpaid", // unpaid | pending | paid
    deliveryStatus: deliveryStatus || "processing", // processing | shipped | delivered
    createdBy: req.user.username,
    createdAt: new Date().toISOString(),
  };
  db.orders.push(freshOrder);
  await saveDB(db);
  res.json(freshOrder);
});

app.put("/api/orders/:id", requireLogin, async (req, res) => {
  const db = await loadDB();
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "no order with that id" });
  // staff can nudge payment + delivery status (that's their day-to-day job), founder can edit anything
  if (req.user.role === "staff") {
    if (req.body.paymentStatus) order.paymentStatus = req.body.paymentStatus;
    if (req.body.deliveryStatus) order.deliveryStatus = req.body.deliveryStatus;
  } else {
    Object.assign(order, req.body);
  }
  await saveDB(db);
  res.json(order);
});

app.delete("/api/orders/:id", requireLogin, requireFounder, async (req, res) => {
  const db = await loadDB();
  db.orders = db.orders.filter((o) => o.id !== req.params.id);
  await saveDB(db);
  res.json({ ok: true });
});

// ---------------- STOCK ----------------
app.get("/api/stock", requireLogin, async (req, res) => {
  res.json((await loadDB()).stock);
});

app.post("/api/stock", requireLogin, async (req, res) => {
  const { itemName, quantity, price } = req.body;
  if (!itemName) return res.status(400).json({ error: "item needs a name" });
  const db = await loadDB();
  const newItem = {
    id: "stk_" + Date.now(),
    itemName,
    quantity: Number(quantity) || 0,
    price: Number(price) || 0,
  };
  db.stock.push(newItem);
  await saveDB(db);
  res.json(newItem);
});

app.put("/api/stock/:id", requireLogin, async (req, res) => {
  const db = await loadDB();
  const item = db.stock.find((s) => s.id === req.params.id);
  if (!item) return res.status(404).json({ error: "no stock item with that id" });
  // staff can only touch quantity (e.g. after a sale), founder can rename/reprice too
  if (req.user.role === "staff") {
    if (req.body.quantity !== undefined) item.quantity = Number(req.body.quantity);
  } else {
    if (req.body.itemName !== undefined) item.itemName = req.body.itemName;
    if (req.body.quantity !== undefined) item.quantity = Number(req.body.quantity);
    if (req.body.price !== undefined) item.price = Number(req.body.price);
  }
  await saveDB(db);
  res.json(item);
});

app.delete("/api/stock/:id", requireLogin, requireFounder, async (req, res) => {
  const db = await loadDB();
  db.stock = db.stock.filter((s) => s.id !== req.params.id);
  await saveDB(db);
  res.json({ ok: true });
});

module.exports = app;
