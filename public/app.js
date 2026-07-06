// app.js — the thing that actually makes the buttons do stuff
// state lives up here so every function can see it without passing it around like a hot potato
let me = null;

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "something broke");
  return data;
}
function money(n) {
  return "$" + Number(n || 0).toFixed(2);
}

// ---------- boot ----------
(async function boot() {
  const { user } = await api("/api/me");
  if (user) {
    me = user;
    enterApp();
  } else {
    $("#loginScreen").classList.remove("hidden");
  }
})();

// ---------- login / logout ----------
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    const { user } = await api("/api/login", "POST", {
      username: $("#loginUsername").value.trim(),
      password: $("#loginPassword").value,
    });
    me = user;
    enterApp();
  } catch (err) {
    $("#loginError").textContent = err.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", "POST");
  location.reload();
});

function enterApp() {
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#meUsername").textContent = me.username;
  $("#meRole").textContent = me.role;

  if (me.role === "founder") {
    document.querySelectorAll(".founder-only").forEach((el) => el.classList.remove("hidden"));
  }

  loadOrders();
  loadStock();
  if (me.role === "founder") loadUsers();
}

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("#tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ---------- live-ish sync ----------
// no persistent connection here on purpose — Vercel's serverless functions don't keep
// sockets open, so instead every connected laptop just quietly asks "anything new?"
// every few seconds. Feels basically instant in real use.
setInterval(async () => {
  if (!me) return;
  await loadOrders();
  await loadStock();
  if (me.role === "founder") await loadUsers();
  $("#syncTime").textContent = new Date().toLocaleTimeString();
}, 4000);

// ---------- ORDERS ----------
async function loadOrders() {
  const orders = await api("/api/orders");
  const body = $("#ordersBody");
  body.innerHTML = "";
  $("#ordersEmpty").classList.toggle("hidden", orders.length > 0);

  orders
    .slice()
    .reverse() // newest first, nobody wants to scroll to find today's order
    .forEach((o) => {
      const total = (o.items || []).reduce((sum, it) => sum + it.qty * it.price, 0) + Number(o.shippingPrice || 0);
      const itemsText = (o.items || []).map((it) => `${it.name} x${it.qty}`).join(", ") || "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(o.customerName)}</td>
        <td>${escapeHtml(itemsText)}</td>
        <td>${escapeHtml(o.address)}</td>
        <td>${money(total)}</td>
        <td>${money(o.shippingPrice)}</td>
        <td>
          <select data-order-id="${o.id}" class="payment-select">
            <option value="unpaid" ${o.paymentStatus === "unpaid" ? "selected" : ""}>Unpaid</option>
            <option value="pending" ${o.paymentStatus === "pending" ? "selected" : ""}>Pending</option>
            <option value="paid" ${o.paymentStatus === "paid" ? "selected" : ""}>Paid</option>
          </select>
        </td>
        <td>
          <select data-order-id="${o.id}" class="delivery-select">
            <option value="processing" ${o.deliveryStatus === "processing" ? "selected" : ""}>Processing</option>
            <option value="shipped" ${o.deliveryStatus === "shipped" ? "selected" : ""}>Shipped</option>
            <option value="delivered" ${o.deliveryStatus === "delivered" ? "selected" : ""}>Delivered</option>
          </select>
        </td>
        <td>${new Date(o.createdAt).toLocaleDateString()}</td>
        <td>${me.role === "founder" ? `<button class="icon-btn" data-del-order="${o.id}">✕</button>` : ""}</td>
      `;
      body.appendChild(tr);
    });

  body.querySelectorAll(".payment-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { paymentStatus: sel.value });
    });
  });
  body.querySelectorAll(".delivery-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { deliveryStatus: sel.value });
    });
  });
  body.querySelectorAll("[data-del-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this order for good?")) await api(`/api/orders/${btn.dataset.delOrder}`, "DELETE");
    });
  });
}

$("#openAddOrder").addEventListener("click", async () => {
  await refreshStockCache();
  $("#orderItemsList").innerHTML = "";
  addItemRow(); // start with one row, "+ Add item" grows it
  updateOrderTotalPreview();
  $("#orderModal").classList.remove("hidden");
});

$("#addItemRow").addEventListener("click", () => addItemRow());

// keep a local copy of stock so the dropdowns don't need a network trip on every row
let stockCache = [];
async function refreshStockCache() {
  stockCache = await api("/api/stock");
}

function addItemRow() {
  const row = document.createElement("div");
  row.className = "item-row";

  const options = stockCache
    .map((s) => `<option value="${s.id}" data-price="${s.price}" data-name="${escapeHtml(s.itemName)}">${escapeHtml(s.itemName)} (${s.quantity} in stock) — ${money(s.price)}</option>`)
    .join("");

  row.innerHTML = `
    <select class="item-stock-select">${options || "<option disabled>No stock items yet — add some in the Stock tab first</option>"}</select>
    <input type="number" class="item-qty" min="1" value="1" />
    <button type="button" class="icon-btn remove-item-row">✕</button>
  `;
  $("#orderItemsList").appendChild(row);

  row.querySelector(".item-qty").addEventListener("input", updateOrderTotalPreview);
  row.querySelector(".item-stock-select").addEventListener("change", updateOrderTotalPreview);
  row.querySelector(".remove-item-row").addEventListener("click", () => {
    row.remove();
    updateOrderTotalPreview();
  });
  updateOrderTotalPreview();
}

function collectOrderItems() {
  return Array.from($("#orderItemsList").querySelectorAll(".item-row"))
    .map((row) => {
      const select = row.querySelector(".item-stock-select");
      const opt = select.options[select.selectedIndex];
      if (!opt || opt.disabled) return null;
      return {
        stockId: opt.value,
        name: opt.dataset.name,
        price: Number(opt.dataset.price),
        qty: Number(row.querySelector(".item-qty").value) || 1,
      };
    })
    .filter(Boolean);
}

function updateOrderTotalPreview() {
  const items = collectOrderItems();
  const itemsTotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const shipping = Number($("#ordShipping").value) || 0;
  $("#orderTotalPreview").textContent = money(itemsTotal + shipping);
}
$("#ordShipping").addEventListener("input", updateOrderTotalPreview);

$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const items = collectOrderItems();
  if (items.length === 0) {
    alert("Pick at least one item from stock, bro.");
    return;
  }
  await api("/api/orders", "POST", {
    customerName: $("#ordCustomer").value.trim(),
    address: $("#ordAddress").value.trim(),
    items,
    shippingPrice: $("#ordShipping").value,
    paymentStatus: $("#ordPayment").value,
    deliveryStatus: $("#ordDelivery").value,
  });
  e.target.reset();
  $("#orderItemsList").innerHTML = "";
  $("#orderModal").classList.add("hidden");
});

// ---------- STOCK ----------
async function loadStock() {
  const stock = await api("/api/stock");
  const body = $("#stockBody");
  body.innerHTML = "";
  $("#stockEmpty").classList.toggle("hidden", stock.length > 0);

  stock.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.itemName)}</td>
      <td><input type="number" min="0" value="${s.quantity}" data-qty-id="${s.id}" style="width:70px" /></td>
      <td>${money(s.price)}</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-stock="${s.id}">✕</button>` : ""}</td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll("[data-qty-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      await api(`/api/stock/${input.dataset.qtyId}`, "PUT", { quantity: input.value });
    });
  });
  body.querySelectorAll("[data-del-stock]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Remove this item from stock?")) await api(`/api/stock/${btn.dataset.delStock}`, "DELETE");
    });
  });
}

$("#openAddStock").addEventListener("click", () => $("#stockModal").classList.remove("hidden"));

$("#stockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/stock", "POST", {
    itemName: $("#stkName").value.trim(),
    quantity: $("#stkQty").value,
    price: $("#stkPrice").value,
  });
  e.target.reset();
  $("#stockModal").classList.add("hidden");
});

// ---------- TEAM (founder only) ----------
async function loadUsers() {
  const users = await api("/api/users");
  const body = $("#usersBody");
  body.innerHTML = "";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(u.username)}</td>
      <td><span class="role-badge">${u.role}</span></td>
      <td>${u.role !== "founder" ? `<button class="icon-btn" data-del-user="${u.id}">✕</button>` : ""}</td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-del-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Revoke this account's access?")) await api(`/api/users/${btn.dataset.delUser}`, "DELETE");
    });
  });
}

$("#addStaffForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/users", "POST", {
    username: $("#newStaffUsername").value.trim(),
    password: $("#newStaffPassword").value,
  });
  e.target.reset();
});

// ---------- CHANGE PASSWORD ----------
$("#openChangePassword").addEventListener("click", () => $("#passwordModal").classList.remove("hidden"));

$("#passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#pwError").textContent = "";
  try {
    await api("/api/change-password", "POST", {
      oldPassword: $("#pwOld").value,
      newPassword: $("#pwNew").value,
    });
    e.target.reset();
    $("#passwordModal").classList.add("hidden");
    alert("Password changed. Use the new one next time you log in.");
  } catch (err) {
    $("#pwError").textContent = err.message;
  }
});

// ---------- modal close buttons ----------
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => $("#" + btn.dataset.close).classList.add("hidden"));
});

// don't let a sneaky customer name break the table with a rogue <script>
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
