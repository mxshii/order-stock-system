// app.js — sidebar layout, phone/email fields, dark mode
let me = null;

// ── helpers ──────────────────────────────────────────────────────────────
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ── dark mode ─────────────────────────────────────────────────────────────
// persist preference in localStorage so it survives page refreshes
function applyDarkMode(dark) {
  document.body.classList.toggle("dark", dark);
  const btn = $("#darkModeToggle");
  if (!btn) return;
  const icon = btn.querySelector("svg");
  if (dark) {
    // sun icon
    if (icon) icon.innerHTML = '<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>';
    btn.lastChild.textContent = " Light mode";
    btn.classList.add("active-toggle");
  } else {
    // moon icon
    if (icon) icon.innerHTML = '<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>';
    btn.lastChild.textContent = " Dark mode";
    btn.classList.remove("active-toggle");
  }
}

// apply saved preference immediately (before paint to avoid flash)
(function initDark() {
  const saved = localStorage.getItem("darkMode");
  if (saved === "true") applyDarkMode(true);
})();

// ── boot ──────────────────────────────────────────────────────────────────
(async function boot() {
  // show today's date in topbar
  const now = new Date();
  const dayEl = $("#topbarDate");
  if (dayEl) {
    dayEl.textContent = now.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  }

  const { user } = await api("/api/me");
  if (user) {
    me = user;
    enterApp();
  } else {
    $("#loginScreen").classList.remove("hidden");
  }
})();

// ── login / logout ────────────────────────────────────────────────────────
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

  // populate sidebar user info
  $("#meUsername").textContent = me.username;
  $("#meRole").textContent = me.role;
  const avatarEl = $("#userAvatarLetter");
  if (avatarEl) avatarEl.textContent = me.username.charAt(0).toUpperCase();

  if (me.role === "founder") {
    document.querySelectorAll(".founder-only").forEach((el) => el.classList.remove("hidden"));
  }

  // re-sync dark mode button state (in case it was applied before the button existed)
  applyDarkMode(document.body.classList.contains("dark"));

  // wire up dark mode toggle
  const dmBtn = $("#darkModeToggle");
  if (dmBtn) {
    dmBtn.addEventListener("click", () => {
      const isDark = !document.body.classList.contains("dark");
      applyDarkMode(isDark);
      localStorage.setItem("darkMode", isDark);
    });
  }

  loadOrders();
  loadStock();
  if (me.role === "founder") loadUsers();
}

// ── sidebar navigation ────────────────────────────────────────────────────
const pageTitles = { orders: "Orders", stock: "Stock", team: "Team Access" };

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $("#tab-" + tab).classList.add("active");
    const titleEl = $("#pageTitle");
    if (titleEl) titleEl.textContent = pageTitles[tab] || tab;
  });
});

// ── live sync ─────────────────────────────────────────────────────────────
setInterval(async () => {
  if (!me) return;
  await loadOrders();
  await loadStock();
  if (me.role === "founder") await loadUsers();
  $("#syncTime").textContent = new Date().toLocaleTimeString();
}, 4000);

// ── ORDERS ────────────────────────────────────────────────────────────────
async function loadOrders() {
  const orders = await api("/api/orders");
  const body = $("#ordersBody");
  body.innerHTML = "";
  $("#ordersEmpty").classList.toggle("hidden", orders.length > 0);

  orders
    .slice()
    .reverse()
    .forEach((o) => {
      const total = (o.items || []).reduce((sum, it) => sum + it.qty * it.price, 0) + Number(o.shippingPrice || 0);
      const itemsText = (o.items || []).map((it) => `${it.name} x${it.qty}`).join(", ") || "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:600;font-family:var(--font)">${escapeHtml(o.customerName)}</div>
          ${o.email ? `<div style="font-size:11px;color:var(--text-muted);font-family:var(--font)">${escapeHtml(o.email)}</div>` : ""}
        </td>
        <td>${escapeHtml(o.phone || "—")}</td>
        <td title="${escapeHtml(itemsText)}">${escapeHtml(itemsText.length > 40 ? itemsText.slice(0, 38) + "…" : itemsText)}</td>
        <td>${escapeHtml(o.address)}</td>
        <td style="font-weight:600">${money(total)}</td>
        <td>${money(o.shippingPrice)}</td>
        <td>
          <select data-order-id="${o.id}" class="payment-select">
            <option value="unpaid"  ${o.paymentStatus === "unpaid"  ? "selected" : ""}>Unpaid</option>
            <option value="pending" ${o.paymentStatus === "pending" ? "selected" : ""}>Pending</option>
            <option value="paid"    ${o.paymentStatus === "paid"    ? "selected" : ""}>Paid</option>
          </select>
        </td>
        <td>
          <select data-order-id="${o.id}" class="delivery-select">
            <option value="processing" ${o.deliveryStatus === "processing" ? "selected" : ""}>Processing</option>
            <option value="shipped"    ${o.deliveryStatus === "shipped"    ? "selected" : ""}>Shipped</option>
            <option value="delivered"  ${o.deliveryStatus === "delivered"  ? "selected" : ""}>Delivered</option>
          </select>
        </td>
        <td>${new Date(o.createdAt).toLocaleDateString()}</td>
        <td>${me.role === "founder" ? `<button class="icon-btn" data-del-order="${o.id}" title="Delete order">✕</button>` : ""}</td>
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
      if (confirm("Delete this order for good?")) {
        await api(`/api/orders/${btn.dataset.delOrder}`, "DELETE");
        loadOrders();
      }
    });
  });
}

$("#openAddOrder").addEventListener("click", async () => {
  await refreshStockCache();
  $("#orderItemsList").innerHTML = "";
  addItemRow();
  updateOrderTotalPreview();
  // reset fields
  $("#ordCustomer").value = "";
  $("#ordPhone").value = "";
  $("#ordEmail").value = "";
  $("#ordAddress").value = "";
  $("#ordShipping").value = "0";
  $("#orderModal").classList.remove("hidden");
});

$("#addItemRow").addEventListener("click", () => addItemRow());

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
    <select class="item-stock-select">${options || '<option disabled>No stock items yet — add some in Stock tab first</option>'}</select>
    <input type="number" class="item-qty" min="1" value="1" />
    <button type="button" class="icon-btn remove-item-row" title="Remove">✕</button>
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
    alert("Pick at least one item from stock.");
    return;
  }
  await api("/api/orders", "POST", {
    customerName: $("#ordCustomer").value.trim(),
    phone: $("#ordPhone").value.trim(),
    email: $("#ordEmail").value.trim() || null,
    address: $("#ordAddress").value.trim(),
    items,
    shippingPrice: $("#ordShipping").value,
    paymentStatus: $("#ordPayment").value,
    deliveryStatus: $("#ordDelivery").value,
  });
  e.target.reset();
  $("#orderItemsList").innerHTML = "";
  $("#orderModal").classList.add("hidden");
  loadOrders();
});

// ── STOCK ─────────────────────────────────────────────────────────────────
async function loadStock() {
  const stock = await api("/api/stock");
  const body = $("#stockBody");
  body.innerHTML = "";
  $("#stockEmpty").classList.toggle("hidden", stock.length > 0);

  stock.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:var(--font);font-weight:500">${escapeHtml(s.itemName)}</td>
      <td><input type="number" min="0" value="${s.quantity}" data-qty-id="${s.id}" style="width:80px;font-size:13px;padding:5px 8px" /></td>
      <td>${money(s.price)}</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-stock="${s.id}" title="Remove">✕</button>` : ""}</td>
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
      if (confirm("Remove this item from stock?")) {
        await api(`/api/stock/${btn.dataset.delStock}`, "DELETE");
        loadStock();
      }
    });
  });
}

$("#openAddStock").addEventListener("click", () => {
  $("#stkName").value = "";
  $("#stkQty").value = "0";
  $("#stkPrice").value = "0";
  $("#stockModal").classList.remove("hidden");
});

$("#stockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/stock", "POST", {
    itemName: $("#stkName").value.trim(),
    quantity: $("#stkQty").value,
    price: $("#stkPrice").value,
  });
  e.target.reset();
  $("#stockModal").classList.add("hidden");
  loadStock();
});

// ── TEAM (founder only) ───────────────────────────────────────────────────
async function loadUsers() {
  const users = await api("/api/users");
  const body = $("#usersBody");
  body.innerHTML = "";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:var(--font);font-weight:500">${escapeHtml(u.username)}</td>
      <td><span class="role-badge" style="background:var(--surface-raised);border-color:var(--border);color:var(--text-muted)">${u.role}</span></td>
      <td>${u.role !== "founder" ? `<button class="icon-btn" data-del-user="${u.id}" title="Revoke access">✕</button>` : ""}</td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-del-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Revoke this account's access?")) {
        await api(`/api/users/${btn.dataset.delUser}`, "DELETE");
        loadUsers();
      }
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
  loadUsers();
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────
$("#openChangePassword").addEventListener("click", () => {
  $("#pwOld").value = "";
  $("#pwNew").value = "";
  $("#pwError").textContent = "";
  $("#passwordModal").classList.remove("hidden");
});

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

// ── modal close buttons ───────────────────────────────────────────────────
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => $("#" + btn.dataset.close).classList.add("hidden"));
});

// close modal on backdrop click
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});
