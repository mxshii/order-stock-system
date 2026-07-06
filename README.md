# OrderDeck

Order + stock management, syncs across every device — same WiFi OR completely different homes if you deploy it to Vercel.

## How it works (the 30-second version)

- **Locally (same WiFi)**: one laptop runs the server, others just open a browser and type its IP address.
- **On Vercel (any home, anywhere)**: the app lives online with a real web address, like `orderdeck.vercel.app`. Anyone with the link and an account can use it, no shared WiFi needed.
- Every device checks for updates every few seconds automatically (that's the pulsing "LIVE" dot up top) — so if someone adds an order on one device, it shows up on everyone else's within a few seconds.

---

## Option A: Deploy to Vercel (works from any home, anywhere)

This is the one you want if people are connecting from different houses.

**Step 1 — Push this project to GitHub**
- If you don't already have a repo for it, create one on [github.com](https://github.com) and push this folder to it.

**Step 2 — Import it into Vercel**
- Go to [vercel.com](https://vercel.com), log in, click **"Add New" → "Project"**
- Select your GitHub repo, click **Deploy**
- It'll build and give you a link like `https://order-stock-system.vercel.app` — but don't use it yet, one more step first.

**Step 3 — Add a Redis database (this replaces `db.json` online)**
- Why: Vercel doesn't let a project save files permanently, so we need somewhere online to actually store your orders/stock/accounts.
- In your Vercel project, go to the **Storage** tab → **Create Database** → choose **Upstash** → **Redis**
- Click through the setup (free tier is enough for this) and connect it to your project
- This automatically adds two environment variables for you — you don't type anything in, Vercel does it

**Step 4 — Add your login secret**
- In your Vercel project, go to **Settings → Environment Variables**
- Add one: `JWT_SECRET` = any long random string you make up (this is what keeps login cookies secure — example: `xk8Ptq2vLmZ9wRfN4hYbJ7cQeA1sUdVo`)

**Step 5 — Redeploy**
- Go to the **Deployments** tab → click the three dots on the latest one → **Redeploy** (this makes it pick up the new environment variables)
- Visit your link. Log in with `founder` / `changeme123`, then **change that password immediately** using the "Change password" button.

That's it — send the Vercel link to anyone, anywhere, and they can log in with an account you create for them.

---

## Option B: Run it locally on your own WiFi (quick + free, no Vercel account needed)

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. You'll see:
   ```
   👑 Founder account created — username: founder | password: changeme123
   🚀 Server's up on port 3000
   ```
4. Go to `http://localhost:3000`, log in, and change your password.

**Connecting other laptops on the same WiFi:**
1. On the host laptop, find its local IP:
   - Mac/Linux: run `ifconfig` (look for something like `192.168.1.42`)
   - Windows: run `ipconfig` (look for "IPv4 Address")
2. On the other laptop, go to `http://192.168.1.42:3000` (swap in the real IP)
3. Log in — done.

**Why this can't reach other homes on its own**: that `192.168.1.42` address only exists inside your home's WiFi router — like an apartment number that only makes sense inside one building. Someone across town typing it into their browser won't reach anything. That's exactly what Option A above solves.

---

## Accounts

- **Founder** (that's you): sees everything, can delete orders/stock, can create and revoke staff accounts.
- **Staff**: can add new orders, update payment + delivery status, and update stock quantities — but can't delete anything or touch the team list.

Add staff accounts from the **Team** tab (only the founder sees this tab). Anyone can change their own password from the "Change password" button in the top bar.

## Data

- **Locally**: everything lives in `db.json` in this folder.
- **On Vercel**: everything lives in your Upstash Redis database (set up in Option A, Step 3). Back it up occasionally — Upstash's dashboard lets you export data if you ever need to.

## To-Do (things worth adding later)

- [x] A proper "change my password" screen
- [x] Delivery status per order, separate from payment status
- [x] Vercel deployment support
- [ ] Export orders to CSV/Excel for accounting
- [ ] Low-stock warnings when quantity hits zero
- [ ] Rate limiting on login (worth adding before this gets a lot of daily traffic)
