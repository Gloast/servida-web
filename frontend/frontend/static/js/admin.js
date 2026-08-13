/**
 * SERVIDA ADMIN & HANDYMAN OPERATIONS PORTAL
 * Real-time order dispatching, Kanban board, calendar routing, role profiles, and service CMS.
 */

let allOrders = [];
let allServices = [];
let activeFilterStatus = "Alle";
let activeOrder = null;
let currentView = "orders";
let chatPollInterval = null;

// Staff Auth State
let currentStaffUser = JSON.parse(localStorage.getItem('servida_staff_user')) || {
  id: 1,
  email: "admin@servida.no",
  full_name: "Servida Administrator",
  role: "admin",
  avatar_url: "👑"
};

// Helper format currency
function formatNOK(amount) {
  return "kr " + Math.round(amount).toLocaleString("no-NO") + ",-";
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "Ny bestilling": return "badge-ny";
    case "Bekreftet": return "badge-bekreftet";
    case "Håndverker tildelt": return "badge-tildelt";
    case "På vei": return "badge-påvei";
    case "Pågår": return "badge-påvei";
    case "Utført":
    case "Fakturert": return "badge-utført";
    case "Kansellert": return "badge-ny";
    default: return "badge-bekreftet";
  }
}

// Check & Apply Auth UI
function checkStaffAuth() {
  const overlay = document.getElementById("admin-auth-overlay");
  if (!currentStaffUser) {
    overlay.style.display = "flex";
    return;
  }
  
  overlay.style.display = "none";
  
  const roleBadge = document.getElementById("current-user-role-badge");
  const userName = document.getElementById("admin-user-name");
  const userEmail = document.getElementById("admin-user-email");
  const avatarBadge = document.getElementById("admin-avatar-badge");
  
  userName.textContent = currentStaffUser.full_name;
  userEmail.textContent = currentStaffUser.email;
  
  if (currentStaffUser.role === "admin") {
    roleBadge.textContent = "👑 Administrator";
    roleBadge.style.background = "#FEF3C7";
    roleBadge.style.color = "#92400E";
    avatarBadge.textContent = "👑";
  } else {
    roleBadge.textContent = `👷 ${currentStaffUser.full_name}`;
    roleBadge.style.background = "#EFF6FF";
    roleBadge.style.color = "#1D4ED8";
    avatarBadge.textContent = "👷";
  }
}

// 1. Fetch KPI stats
async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const stats = await res.json();
    
    document.getElementById("kpi-new-count").textContent = stats.new_orders || 0;
    document.getElementById("badge-new-orders").textContent = stats.new_orders || 0;
    document.getElementById("kpi-active-count").textContent = stats.active_orders || 0;
    document.getElementById("kpi-done-count").textContent = stats.completed_orders || 0;
    document.getElementById("kpi-revenue").textContent = formatNOK(stats.total_revenue || 0);
    
    // Render detailed stats view
    const statsContent = document.getElementById("detailed-stats-content");
    if (statsContent) {
      let topHtml = "";
      (stats.top_services || []).forEach(s => {
        topHtml += `<li style="margin-bottom: 0.5rem; display: flex; justify-content: space-between;"><span>${s.title}</span> <strong>${s.count} oppdrag</strong></li>`;
      });
      
      statsContent.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
          <div>
            <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 1rem;">Mest populære tjenester</h4>
            <ul style="list-style: none; padding: 0;">${topHtml || "Ingen data enda"}</ul>
          </div>
          <div>
            <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 1rem;">Kostnadsbesparelse</h4>
            <p style="color: #64748B; line-height: 1.6;">
              Ved å kjøre Servida på egen plattform fremfor Shopify og app-abonnementer (Globo options, booking apps), sparer bedriften ca. <strong>12 000 – 25 000 kr/år</strong> i faste app-lisenser og transaksjonsgebyrer.
            </p>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error("Feil ved lasting av stats:", err);
  }
}

// 2. Fetch Orders
async function loadOrders() {
  try {
    const searchVal = document.getElementById("admin-search").value.trim();
    let url = "/api/orders";
    const params = new URLSearchParams();
    if (activeFilterStatus !== "Alle") params.append("status", activeFilterStatus);
    if (searchVal) params.append("search", searchVal);
    
    // If logged in as handyman, filter by assignee
    if (currentStaffUser && currentStaffUser.role === "handyman") {
      const shortName = currentStaffUser.full_name.split(" ")[0];
      params.append("handyman", shortName);
    }
    
    if (params.toString()) url += `?${params.toString()}`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error("Feil ved lasting av ordrer");
    const data = await res.json();
    allOrders = data.orders || [];
    
    renderKanban();
    renderTable();
    renderCalendar();
  } catch (err) {
    console.error(err);
  }
}

// 3. Render Kanban Board
function renderKanban() {
  const colNy = document.getElementById("col-list-ny");
  const colBekreftet = document.getElementById("col-list-bekreftet");
  const colTildelt = document.getElementById("col-list-tildelt");
  const colUtfort = document.getElementById("col-list-utført");
  
  colNy.innerHTML = "";
  colBekreftet.innerHTML = "";
  colTildelt.innerHTML = "";
  colUtfort.innerHTML = "";
  
  let cNy = 0, cBekr = 0, cTild = 0, cUtført = 0;
  
  allOrders.forEach(order => {
    const card = document.createElement("div");
    card.className = "kanban-card";
    card.onclick = () => openOrderDrawer(order.id);
    
    const paymentBadge = order.payment_status === "Betalt" || order.payment_status === "Vipps" 
      ? `<span style="font-size: 0.7rem; background: #ECFDF5; color: #059669; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700;">✓ ${order.payment_status}</span>`
      : `<span style="font-size: 0.7rem; background: #FEF3C7; color: #D97706; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600;">⏳ ${order.payment_status || 'Utestående'}</span>`;

    card.innerHTML = `
      <div class="kanban-card-top">
        <span class="kanban-order-num">${order.order_number}</span>
        <span class="kanban-price">${formatNOK(order.total_price)}</span>
      </div>
      <div class="kanban-service-title">${order.service_title}</div>
      <div class="kanban-customer-name">👤 ${order.customer_name} (${order.city})</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem;">
        <span class="kanban-datetime">📅 ${order.preferred_date} (${order.time_slot})</span>
        ${paymentBadge}
      </div>
      ${order.assigned_handyman && order.assigned_handyman !== 'Ikke tildelt' 
        ? `<div style="font-size: 0.75rem; font-weight: 700; color: #3B82F6; margin-top: 0.35rem;">👷 ${order.assigned_handyman}</div>` 
        : `<div style="font-size: 0.75rem; font-weight: 600; color: #EF4444; margin-top: 0.35rem;">⚠️ Ikke tildelt</div>`}
    `;
    
    if (order.status === "Ny bestilling") {
      colNy.appendChild(card);
      cNy++;
    } else if (order.status === "Bekreftet") {
      colBekreftet.appendChild(card);
      cBekr++;
    } else if (order.status === "Håndverker tildelt" || order.status === "På vei" || order.status === "Pågår") {
      colTildelt.appendChild(card);
      cTild++;
    } else if (order.status === "Utført" || order.status === "Fakturert") {
      colUtfort.appendChild(card);
      cUtført++;
    }
  });
  
  document.getElementById("col-count-ny").textContent = cNy;
  document.getElementById("col-count-bekreftet").textContent = cBekr;
  document.getElementById("col-count-tildelt").textContent = cTild;
  document.getElementById("col-count-utført").textContent = cUtført;
}

// 4. Render Table View
function renderTable() {
  const tbody = document.getElementById("orders-table-tbody");
  tbody.innerHTML = "";
  
  if (allOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748B; padding: 2rem;">Ingen oppdrag funnet.</td></tr>`;
    return;
  }
  
  allOrders.forEach(o => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = () => openOrderDrawer(o.id);
    
    tr.innerHTML = `
      <td><strong style="font-family: monospace; color: #0F172A;">${o.order_number}</strong></td>
      <td><strong>${o.customer_name}</strong><br><span style="font-size: 0.8rem; color: #64748B;">📞 ${o.customer_phone}</span></td>
      <td>${o.street_address}, ${o.postal_code} ${o.city}</td>
      <td><strong>${o.service_title}</strong><br><span style="font-size: 0.78rem; color: #64748B;">${o.variant_name || 'Standard'}</span></td>
      <td>${o.preferred_date}<br><span style="font-size: 0.78rem; color: #059669; font-weight: 600;">${o.time_slot}</span></td>
      <td><strong>${formatNOK(o.total_price)}</strong></td>
      <td><span style="font-weight: 600; color: ${o.assigned_handyman === 'Ikke tildelt' ? '#EF4444' : '#0F172A'}">${o.assigned_handyman}</span></td>
      <td><span class="status-badge ${getStatusBadgeClass(o.status)}">${o.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// 5. Render Calendar Day-Grouping
function renderCalendar() {
  const container = document.getElementById("calendar-day-groups");
  if (!container) return;
  container.innerHTML = "";
  
  const grouped = {};
  allOrders.forEach(o => {
    const d = o.preferred_date || "Ukjent dato";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(o);
  });
  
  const sortedDates = Object.keys(grouped).sort();
  if (sortedDates.length === 0) {
    container.innerHTML = `<p style="color: #64748B;">Ingen oppdrag planlagt.</p>`;
    return;
  }
  
  sortedDates.forEach(date => {
    const orders = grouped[date];
    const groupDiv = document.createElement("div");
    groupDiv.style.marginBottom = "1.5rem";
    
    let ordersHtml = "";
    orders.forEach(o => {
      ordersHtml += `
        <div style="background: #F8FAFC; border: 1px solid var(--admin-border); border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="openOrderDrawer(${o.id})">
          <div>
            <span style="font-size: 0.78rem; font-weight: 700; color: #3B82F6;">⏰ ${o.time_slot}</span>
            <h4 style="margin: 0.2rem 0; font-size: 1rem;">${o.service_title} — ${o.customer_name}</h4>
            <span style="font-size: 0.82rem; color: #64748B;">📍 ${o.street_address}, ${o.postal_code} ${o.city}</span>
          </div>
          <div style="text-align: right;">
            <strong style="font-size: 1rem; color: #059669;">${formatNOK(o.total_price)}</strong><br>
            <span class="status-badge ${getStatusBadgeClass(o.status)}" style="margin-top: 0.3rem;">${o.status}</span>
          </div>
        </div>
      `;
    });
    
    groupDiv.innerHTML = `
      <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; color: #0F172A; display: flex; align-items: center; gap: 0.5rem;">
        📅 ${date} <span style="font-size: 0.8rem; font-weight: 600; background: #E2E8F0; padding: 0.15rem 0.5rem; border-radius: 9999px;">${orders.length} oppdrag</span>
      </h4>
      <div>${ordersHtml}</div>
    `;
    container.appendChild(groupDiv);
  });
}

// 6. Open Order Detail Drawer
async function openOrderDrawer(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente ordre");
    
    activeOrder = data.order;
    const o = activeOrder;
    
    document.getElementById("drawer-status-badge").textContent = o.status;
    document.getElementById("drawer-status-badge").className = `status-badge ${getStatusBadgeClass(o.status)}`;
    document.getElementById("drawer-order-id").textContent = o.order_number;
    document.getElementById("drawer-service-title").textContent = o.service_title;
    document.getElementById("drawer-total-price").textContent = formatNOK(o.total_price);
    
    document.getElementById("drawer-customer-name").textContent = o.customer_name;
    document.getElementById("drawer-customer-phone").textContent = `📞 ${o.customer_phone}`;
    document.getElementById("drawer-customer-phone").href = `tel:${o.customer_phone.replace(/\s+/g, '')}`;
    document.getElementById("drawer-customer-email").textContent = o.customer_email;
    
    const mapQuery = encodeURIComponent(`${o.street_address}, ${o.postal_code} ${o.city}`);
    document.getElementById("drawer-address-map").textContent = `📍 ${o.street_address}, ${o.postal_code} ${o.city}`;
    document.getElementById("drawer-address-map").href = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
    
    document.getElementById("drawer-datetime").textContent = `${o.preferred_date} (${o.time_slot})`;
    document.getElementById("drawer-variant").textContent = o.variant_name || "Standard";
    document.getElementById("drawer-notes").textContent = o.notes || "Ingen kommentar.";
    
    // Addons
    const addonsWrap = document.getElementById("drawer-addons-wrap");
    addonsWrap.innerHTML = "";
    if (o.selected_options && o.selected_options.length > 0) {
      o.selected_options.forEach(opt => {
        const div = document.createElement("div");
        div.style.fontSize = "0.82rem";
        div.style.color = "#475569";
        div.innerHTML = `+ <strong>${opt.name}</strong> (${formatNOK(opt.price || 0)})`;
        addonsWrap.appendChild(div);
      });
    } else {
      addonsWrap.innerHTML = `<span style="font-size: 0.8rem; color: #94A3B8;">Ingen tillegg valgt.</span>`;
    }
    
    // Set form selects
    document.getElementById("drawer-assignee-select").value = o.assigned_handyman || "Ikke tildelt";
    document.getElementById("drawer-status-select").value = o.status || "Ny bestilling";
    document.getElementById("drawer-payment-select").value = o.payment_status || "Utestående";
    document.getElementById("drawer-handyman-notes").value = o.handyman_notes || "";
    
    // Render Chat
    renderAdminChat(o.messages || []);
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(refreshAdminChat, 4000);
    
    const drawer = document.getElementById("order-drawer");
    drawer.classList.add("active");
    drawer.setAttribute("aria-hidden", "false");
  } catch (err) {
    alert(err.message);
  }
}

// Close Drawer
function closeOrderDrawer() {
  const drawer = document.getElementById("order-drawer");
  drawer.classList.remove("active");
  drawer.setAttribute("aria-hidden", "true");
  if (chatPollInterval) clearInterval(chatPollInterval);
}

document.getElementById("drawer-close-btn").addEventListener("click", closeOrderDrawer);
document.getElementById("order-drawer").addEventListener("click", (e) => {
  if (e.target.id === "order-drawer") closeOrderDrawer();
});

// Save Order Updates from Drawer
document.getElementById("btn-save-order-updates").addEventListener("click", async () => {
  if (!activeOrder) return;
  
  const status = document.getElementById("drawer-status-select").value;
  const assigned_handyman = document.getElementById("drawer-assignee-select").value;
  const payment_status = document.getElementById("drawer-payment-select").value;
  const handyman_notes = document.getElementById("drawer-handyman-notes").value;
  
  const btn = document.getElementById("btn-save-order-updates");
  btn.disabled = true;
  btn.textContent = "Lagrer...";
  
  try {
    const res = await fetch(`/api/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        assigned_handyman,
        payment_status,
        handyman_notes,
        updated_by: currentStaffUser ? currentStaffUser.full_name : "Admin"
      })
    });
    
    if (!res.ok) throw new Error("Kunne ikke lagre endringer");
    
    await loadOrders();
    await loadStats();
    closeOrderDrawer();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Lagre endringer";
  }
});

// Handyman Quick Action Buttons (På vei, Startet, Fullfør)
document.querySelectorAll(".btn-action-status").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!activeOrder) return;
    const newStatus = btn.dataset.status;
    const handymanName = currentStaffUser ? currentStaffUser.full_name : "Håndverker";
    
    let note = "";
    if (newStatus === "Utført") {
      note = prompt("Skriv en kort arbeidsrapport/kommentar (valgfritt):") || "";
    }
    
    try {
      const res = await fetch(`/api/handyman/orders/${activeOrder.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          note: note,
          handyman_name: handymanName
        })
      });
      
      if (!res.ok) throw new Error("Kunne ikke oppdatere status");
      
      document.getElementById("drawer-status-select").value = newStatus;
      await loadOrders();
      await loadStats();
      openOrderDrawer(activeOrder.id);
    } catch (err) {
      alert(err.message);
    }
  });
});

// Render Chat inside Drawer
function renderAdminChat(messages) {
  const box = document.getElementById("drawer-chat-box");
  if (!messages || messages.length === 0) {
    box.innerHTML = `<span style="font-size: 0.8rem; color: #94A3B8; font-style: italic;">Ingen meldinger enda.</span>`;
    return;
  }
  
  box.innerHTML = messages.map(m => {
    const isCustomer = m.sender_role === "customer";
    return `
      <div style="background: ${isCustomer ? '#EFF6FF' : '#F1F5F9'}; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.82rem; align-self: ${isCustomer ? 'flex-start' : 'flex-end'}; max-width: 85%;">
        <strong style="color: ${isCustomer ? '#1D4ED8' : '#0F172A'}; display: block; font-size: 0.72rem;">
          ${m.sender_name} (${m.created_at ? m.created_at.split(' ')[1] : ''})
        </strong>
        <span>${m.message}</span>
      </div>
    `;
  }).join("");
  
  box.scrollTop = box.scrollHeight;
}

async function refreshAdminChat() {
  if (!activeOrder) return;
  try {
    const res = await fetch(`/api/orders/${activeOrder.id}/messages`);
    const data = await res.json();
    renderAdminChat(data.messages || []);
  } catch (err) {
    console.error(err);
  }
}

// Send Admin Chat Reply
document.getElementById("btn-drawer-send-chat").addEventListener("click", async () => {
  if (!activeOrder) return;
  const input = document.getElementById("drawer-chat-input");
  const message = input.value.trim();
  if (!message) return;
  
  const sender_name = currentStaffUser ? currentStaffUser.full_name : "Servida Support";
  const sender_role = currentStaffUser ? currentStaffUser.role : "admin";
  const sender_id = currentStaffUser ? currentStaffUser.id : 1;
  
  input.value = "";
  try {
    await fetch(`/api/orders/${activeOrder.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sender_name, sender_role, sender_id })
    });
    refreshAdminChat();
  } catch (err) {
    alert("Feil ved sending: " + err.message);
  }
});

// View Navigation Switcher
document.querySelectorAll(".admin-nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    currentView = btn.dataset.view;
    document.getElementById("admin-view-title").textContent = btn.textContent.trim().replace(/[^\p{L}\s&]/gu, '').trim();
    
    document.getElementById("view-orders").style.display = currentView === "orders" ? "block" : "none";
    document.getElementById("view-calendar").style.display = currentView === "calendar" ? "block" : "none";
    document.getElementById("view-services").style.display = currentView === "services" ? "block" : "none";
    document.getElementById("view-stats").style.display = currentView === "stats" ? "block" : "none";
    
    if (currentView === "services") loadServicesCMS();
  });
});

// Filter Tabs
document.querySelectorAll(".filter-tab-btn").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab-btn").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeFilterStatus = tab.dataset.status;
    loadOrders();
  });
});

// View Mode (Kanban vs Table)
document.getElementById("btn-show-kanban").addEventListener("click", () => {
  document.getElementById("kanban-board-container").style.display = "grid";
  document.getElementById("table-view-container").style.display = "none";
  document.getElementById("btn-show-kanban").style.background = "#0F172A";
  document.getElementById("btn-show-kanban").style.color = "white";
  document.getElementById("btn-show-table").style.background = "white";
  document.getElementById("btn-show-table").style.color = "#475569";
});

document.getElementById("btn-show-table").addEventListener("click", () => {
  document.getElementById("kanban-board-container").style.display = "none";
  document.getElementById("table-view-container").style.display = "block";
  document.getElementById("btn-show-table").style.background = "#0F172A";
  document.getElementById("btn-show-table").style.color = "white";
  document.getElementById("btn-show-kanban").style.background = "white";
  document.getElementById("btn-show-kanban").style.color = "#475569";
});

// Refresh button & Search
document.getElementById("btn-refresh-admin").addEventListener("click", () => {
  loadStats();
  loadOrders();
});

document.getElementById("admin-search").addEventListener("input", () => {
  loadOrders();
});

// 7. Services CMS Loader
async function loadServicesCMS() {
  const container = document.getElementById("services-cms-grid");
  container.innerHTML = "<p>Laster inn tjenestekatalog...</p>";
  
  try {
    const res = await fetch("/api/catalog");
    const data = await res.json();
    allServices = data.services || [];
    
    container.innerHTML = "";
    allServices.forEach(s => {
      const card = document.createElement("div");
      card.className = "service-cms-card";
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <h4 style="font-size: 1.05rem; font-weight: 700; color: #0F172A;">${s.title}</h4>
            <span style="font-size: 0.72rem; background: #E2E8F0; padding: 0.2rem 0.5rem; border-radius: 9999px; font-weight: 600;">${s.category}</span>
          </div>
          <p style="font-size: 0.82rem; color: #64748B; margin-bottom: 1rem; line-height: 1.4;">${s.short_description || ''}</p>
        </div>
        
        <div style="border-top: 1px solid var(--admin-border); padding-top: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <span style="font-size: 0.8rem; font-weight: 700; color: #475569;">Fastpris fra:</span>
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              <span style="font-weight: 700;">kr</span>
              <input type="number" id="cms-price-${s.handle}" value="${s.price_from}" style="width: 90px; height: 32px; border-radius: 6px; border: 1px solid var(--admin-border); padding: 0 0.4rem; font-weight: 800; text-align: right;">
            </div>
          </div>
          
          <button class="btn-save-cms-service" onclick="saveServicePrice('${s.handle}')" style="width: 100%; height: 36px; background: #0F172A; color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
            💾 Oppdater fastpris
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<p style="color: #DC2626;">Feil ved lasting: ${err.message}</p>`;
  }
}

async function saveServicePrice(handle) {
  const inp = document.getElementById(`cms-price-${handle}`);
  const newPrice = parseFloat(inp.value);
  if (isNaN(newPrice)) return alert("Ugyldig pris.");
  
  try {
    const res = await fetch(`/api/services/${handle}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_from: newPrice })
    });
    if (!res.ok) throw new Error("Kunne ikke oppdatere pris");
    alert(`Fastpris for '${handle}' er oppdatert til kr ${newPrice},-`);
  } catch (err) {
    alert(err.message);
  }
}

// 8. Staff Auth Overlay & Switcher
const formAdminLogin = document.getElementById("form-admin-login");
const adminLoginEmail = document.getElementById("admin-login-email");
const adminLoginPassword = document.getElementById("admin-login-password");
const adminLoginError = document.getElementById("admin-login-error");
const btnAdminLogout = document.getElementById("btn-admin-logout");

if (btnAdminLogout) {
  btnAdminLogout.addEventListener("click", () => {
    currentStaffUser = null;
    localStorage.removeItem("servida_staff_user");
    checkStaffAuth();
  });
}

// 1-Click Profile Switchers
document.getElementById("btn-login-admin-quick").addEventListener("click", () => {
  loginAsStaff("admin@servida.no", "servida2026");
});
document.getElementById("btn-login-lars-quick").addEventListener("click", () => {
  loginAsStaff("lars@servida.no", "lars2026");
});
document.getElementById("btn-login-magnus-quick").addEventListener("click", () => {
  loginAsStaff("magnus@servida.no", "magnus2026");
});
document.getElementById("btn-login-erik-quick").addEventListener("click", () => {
  loginAsStaff("erik@servida.no", "erik2026");
});

if (formAdminLogin) {
  formAdminLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    loginAsStaff(adminLoginEmail.value.trim(), adminLoginPassword.value.trim());
  });
}

async function loginAsStaff(email, password) {
  adminLoginError.style.display = "none";
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Feil innlogging");
    
    currentStaffUser = data.user;
    localStorage.setItem("servida_staff_user", JSON.stringify(currentStaffUser));
    checkStaffAuth();
    loadStats();
    loadOrders();
  } catch (err) {
    adminLoginError.textContent = err.message;
    adminLoginError.style.display = "block";
  }
}

// Init Portal
checkStaffAuth();
loadStats();
loadOrders();
checkAiConfigStatus();

// ==========================================================================
// 9. GEMINI AI SERVICE & IMAGE GENERATOR CONTROLLER
// ==========================================================================

const aiCreatorModal = document.getElementById("ai-service-creator-modal");
const btnOpenAiCreator = document.getElementById("btn-open-ai-creator");
const btnCloseAiCreator = document.getElementById("btn-close-ai-creator");
const btnCancelAiCreator = document.getElementById("btn-cancel-ai-creator");
const btnRunAiGenerator = document.getElementById("btn-run-ai-generator");

const aiPromptInput = document.getElementById("ai-prompt-input");
const aiCategorySelect = document.getElementById("ai-category-select");
const aiPriceHint = document.getElementById("ai-price-hint");

const aiCreatorInputStep = document.getElementById("ai-creator-input-step");
const aiCreatorPreviewStep = document.getElementById("ai-creator-preview-step");

const aiResTitle = document.getElementById("ai-res-title");
const aiResHandle = document.getElementById("ai-res-handle");
const aiResPrice = document.getElementById("ai-res-price");
const aiResShortDesc = document.getElementById("ai-res-short-desc");
const aiResDesc = document.getElementById("ai-res-desc");
const aiResImagePrompt = document.getElementById("ai-res-image-prompt");
const aiResImagePreview = document.getElementById("ai-res-image-preview");
const aiImageEmptyPlaceholder = document.getElementById("ai-image-empty-placeholder");
const btnGenerateAiImage = document.getElementById("btn-generate-ai-image");
const btnSaveAiService = document.getElementById("btn-save-ai-service");

let currentGeneratedService = null;
let currentGeneratedImageUrl = "";

// Open AI Creator
if (btnOpenAiCreator) {
  btnOpenAiCreator.addEventListener("click", () => {
    aiCreatorModal.style.display = "flex";
    aiCreatorPreviewStep.style.display = "none";
    aiPromptInput.value = "";
    aiPriceHint.value = "";
    currentGeneratedService = null;
    currentGeneratedImageUrl = "";
    aiResImagePreview.style.display = "none";
    aiImageEmptyPlaceholder.style.display = "block";
    setTimeout(() => aiPromptInput.focus(), 150);
  });
}

function closeAiCreator() {
  aiCreatorModal.style.display = "none";
}

if (btnCloseAiCreator) btnCloseAiCreator.addEventListener("click", closeAiCreator);
if (btnCancelAiCreator) btnCancelAiCreator.addEventListener("click", closeAiCreator);
if (aiCreatorModal) {
  aiCreatorModal.addEventListener("click", (e) => {
    if (e.target === aiCreatorModal) closeAiCreator();
  });
}

// Generate Service Specification with Gemini AI
if (btnRunAiGenerator) {
  btnRunAiGenerator.addEventListener("click", async () => {
    const promptText = aiPromptInput.value.trim();
    if (!promptText) {
      alert("Vennligst beskriv hva slags tjeneste du ønsker å opprette.");
      return;
    }

    btnRunAiGenerator.disabled = true;
    btnRunAiGenerator.innerHTML = "⏳ Gemini AI analyserer og genererer...";

    try {
      const category = aiCategorySelect.value;
      const rough_price = parseFloat(aiPriceHint.value) || null;

      const res = await fetch("/api/ai/generate-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, category, rough_price })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Feil ved AI-generering");

      const s = data.service;
      currentGeneratedService = s;

      // Populate preview form
      aiResTitle.value = s.title || promptText;
      aiResHandle.value = s.handle || "ny-tjeneste";
      aiResPrice.value = s.price_from || 1490;
      aiResShortDesc.value = s.short_description || "";
      aiResDesc.value = s.description || "";
      aiResImagePrompt.value = s.image_prompt || `${s.title}, professional photography`;

      aiCreatorPreviewStep.style.display = "block";

      // Auto-trigger image generation
      generateImageWithAi();

    } catch (err) {
      alert("AI-generering feilet: " + err.message);
    } finally {
      btnRunAiGenerator.disabled = false;
      btnRunAiGenerator.innerHTML = "🤖 Generer full tjenestebeskrivelse med Gemini AI";
    }
  });
}

// Generate Image with AI
async function generateImageWithAi() {
  const prompt = aiResImagePrompt.value.trim() || aiResTitle.value;
  const handle = aiResHandle.value.trim() || "ny-tjeneste";

  btnGenerateAiImage.disabled = true;
  btnGenerateAiImage.innerHTML = "🎨 Genererer fotorealistisk bilde...";

  try {
    const res = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, handle })
    });

    const data = await res.json();
    if (data.image_url) {
      currentGeneratedImageUrl = data.image_url;
      aiResImagePreview.src = data.image_url + "?t=" + Date.now();
      aiResImagePreview.style.display = "block";
      aiImageEmptyPlaceholder.style.display = "none";
    }
  } catch (err) {
    console.error("Bildefeil:", err);
  } finally {
    btnGenerateAiImage.disabled = false;
    btnGenerateAiImage.innerHTML = "🎨 Generer nytt produktbilde";
  }
}

if (btnGenerateAiImage) {
  btnGenerateAiImage.addEventListener("click", generateImageWithAi);
}

// Save & Publish Service
if (btnSaveAiService) {
  btnSaveAiService.addEventListener("click", async () => {
    if (!currentGeneratedService) currentGeneratedService = {};

    const serviceData = {
      ...currentGeneratedService,
      title: aiResTitle.value.trim(),
      handle: aiResHandle.value.trim(),
      category: aiCategorySelect.value,
      price_from: parseFloat(aiResPrice.value) || 1490.0,
      short_description: aiResShortDesc.value.trim(),
      description: aiResDesc.value.trim(),
      image_url: currentGeneratedImageUrl || `/static/images/products/${aiResHandle.value.trim()}.jpg`,
      images: [currentGeneratedImageUrl || `/static/images/products/${aiResHandle.value.trim()}.jpg`]
    };

    btnSaveAiService.disabled = true;
    btnSaveAiService.innerHTML = "💾 Publiserer...";

    try {
      const res = await fetch("/api/ai/save-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceData })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke lagre tjeneste");

      alert(`✅ Tjenesten «${serviceData.title}» er nå publisert i nettbutikken til fastpris kr ${serviceData.price_from},-!`);
      closeAiCreator();
      loadServicesCMS();
      loadStats();
    } catch (err) {
      alert("Feil ved publisering: " + err.message);
    } finally {
      btnSaveAiService.disabled = false;
      btnSaveAiService.innerHTML = "💾 Lagre & publiser i nettbutikken";
    }
  });
}

// ==========================================================================
// 10. GEMINI API KEY CONFIGURATION MODAL
// ==========================================================================

const aiConfigModal = document.getElementById("ai-config-modal");
const btnOpenAiSettings = document.getElementById("btn-open-ai-settings");
const btnCloseAiConfig = document.getElementById("btn-close-ai-config");
const inputGeminiApiKey = document.getElementById("input-gemini-api-key");
const btnSaveAiKey = document.getElementById("btn-save-ai-key");
const aiKeyStatusLabel = document.getElementById("ai-key-status-label");

async function checkAiConfigStatus() {
  try {
    const res = await fetch("/api/ai/config");
    const data = await res.json();
    if (aiKeyStatusLabel) {
      if (data.configured) {
        aiKeyStatusLabel.textContent = `✓ Aktiv nøkkel tilkoblet (${data.masked_key})`;
        aiKeyStatusLabel.style.color = "#059669";
      } else {
        aiKeyStatusLabel.textContent = "⚠️ Ingen egen nøkkel registrert (bruker standardassistent).";
        aiKeyStatusLabel.style.color = "#D97706";
      }
    }
  } catch (err) {
    console.error(err);
  }
}

if (btnOpenAiSettings) {
  btnOpenAiSettings.addEventListener("click", () => {
    aiConfigModal.style.display = "flex";
    inputGeminiApiKey.value = "";
    checkAiConfigStatus();
    setTimeout(() => inputGeminiApiKey.focus(), 150);
  });
}

if (btnCloseAiConfig) {
  btnCloseAiConfig.addEventListener("click", () => {
    aiConfigModal.style.display = "none";
  });
}

if (aiConfigModal) {
  aiConfigModal.addEventListener("click", (e) => {
    if (e.target === aiConfigModal) aiConfigModal.style.display = "none";
  });
}

if (btnSaveAiKey) {
  btnSaveAiKey.addEventListener("click", async () => {
    const key = inputGeminiApiKey.value.trim();
    if (!key) {
      alert("Vennligst oppgi en gyldig Gemini API-nøkkel.");
      return;
    }

    btnSaveAiKey.disabled = true;
    btnSaveAiKey.textContent = "Lagrer...";

    try {
      const res = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemini_api_key: key })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Feil ved lagring.");

      alert("✓ Gemini API-nøkkel er lagret og aktivert!");
      aiConfigModal.style.display = "none";
      checkAiConfigStatus();
    } catch (err) {
      alert("Feil: " + err.message);
    } finally {
      btnSaveAiKey.disabled = false;
      btnSaveAiKey.textContent = "💾 Lagre API-nøkkel";
    }
  });
}


