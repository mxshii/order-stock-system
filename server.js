// server.js — LOCAL DEV ONLY. This is what you run on your own laptop with `npm start`.
// It's not used on Vercel at all — Vercel calls api/index.js directly instead.
const app = require("./api/index");

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server's up on port ${PORT}`);
  console.log(`   On this laptop: http://localhost:${PORT}`);
  console.log(`   Other laptops on the same WiFi: http://YOUR-IP-ADDRESS:${PORT}`);
});
