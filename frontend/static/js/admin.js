/**
 * SERVIDA ADMIN & HANDYMAN OPERATIONS PORTAL
 * Real-time order dispatching, Kanban board, calendar routing, and service CMS.
 */

let allOrders = [];
let allServices = [];
let activeFilterStatus = "Alle";
let activeOrder = null;
let currentView = "orders";

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
    case "Utført":
    case "Fakturert": return "badge-utført";
    default: return "badge-bekreftet";
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
  
  let countNy = 0, countBekreftet = 0, countTildelt = 0, countUtfort = 0;
  
  allOrders.forEach(o => {
    const card = document.createElement("div");
    let statusClass = "status-ny";
    if (o.status === "Bekreftet") statusClass = "status-bekreftet";
    else if (o.status === "Håndverker tildelt" || o.status === "På vei") statusClass = "status-tildelt";
    else if (o.status === "Utført" || o.status === "Fakturert") statusClass = "status-utført";
    
    card.className = `kanban-card ${statusClass}`;
    card.innerHTML = `
      <div class="kanban-card-top">
        <span class="kanban-order-id">${o.order_number}</span>
        <span style="font-size: 0.85rem; font-weight: 800; color: #0F172A;">${formatNOK(o.total_price)}</span>
      </div>
      <div class="kanban-service-title">${o.service_title}</div>
      <div class="kanban-customer-name">👤 ${o.customer_name} (${o.postal_code} ${o.city})</div>
      <div class="kanban-datetime">📅 ${o.preferred_date} • ${o.time_slot}</div>
      ${o.assigned_handyman && o.assigned_handyman !== "Ikke tildelt" ? `<div style="font-size: 0.78rem; color: #64748B; margin-top: 0.35rem;">👷 ${o.assigned_handyman}</div>` : ""}
    `;
    
    card.addEventListener("click", () => openOrderDrawer(o));
    
    if (o.status === "Ny bestilling") {
      colNy.appendChild(card);
      countNy++;
    } else if (o.status === "Bekreftet") {
      colBekreftet.appendChild(card);
      countBekreftet++;
    } else if (o.status === "Håndverker tildelt" || o.status === "På vei") {
      colTildelt.appendChild(card);
      countTildelt++;
    } else {
      colUtfort.appendChild(card);
      countUtfort++;
    }
  });
  
  document.getElementById("col-count-ny").textContent = countNy;
  document.getElementById("col-count-bekreftet").textContent = countBekreftet;
  document.getElementById("col-count-tildelt").textContent = countTildelt;
  document.getElementById("col-count-utført").textContent = countUtfort;
}

// 4. Render Table View
function renderTable() {
  const tbody = document.getElementById("orders-table-tbody");
  tbody.innerHTML = "";
  
  if (allOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #64748B;">Ingen oppdrag matcher filtreringen.</td></tr>`;
    return;
  }
  
  allOrders.forEach(o => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.innerHTML = `
      <td><strong style="font-family: monospace;">${o.order_number}</strong></td>
      <td>
        <strong>${o.customer_name}</strong><br>
        <span style="font-size: 0.8rem; color: #64748B;">📞 ${o.customer_phone}</span>
      </td>
      <td>${o.street_address}, ${o.postal_code} ${o.city}</td>
      <td>
        <strong>${o.service_title}</strong><br>
        <span style="font-size: 0.8rem; color: #64748B;">${o.variant_name || "Standard"}</span>
      </td>
      <td>
        <strong>${o.preferred_date}</strong><br>
        <span style="font-size: 0.8rem; color: #059669;">${o.time_slot}</span>
      </td>
      <td><strong>${formatNOK(o.total_price)}</strong></td>
      <td>${o.assigned_handyman || "Ikke tildelt"}</td>
      <td><span class="status-badge ${getStatusBadgeClass(o.status)}">${o.status}</span></td>
    `;
    
    tr.addEventListener("click", () => openOrderDrawer(o));
    tbody.appendChild(tr);
  });
}

// 5. Render Calendar Schedule View
function renderCalendar() {
  const container = document.getElementById("calendar-day-groups");
  if (!container) return;
  
  // Group orders by date
  const groups = {};
  allOrders.forEach(o => {
    if (!groups[o.preferred_date]) groups[o.preferred_date] = [];
    groups[o.preferred_date].push(o);
  });
  
  const sortedDates = Object.keys(groups).sort();
  
  if (sortedDates.length === 0) {
    container.innerHTML = "<p style='color: #64748B;'>Ingen oppdrag i kalenderen.</p>";
    return;
  }
  
  container.innerHTML = "";
  sortedDates.forEach(date => {
    const dayBox = document.createElement("div");
    dayBox.style.marginBottom = "1.5rem";
    dayBox.style.border = "1px solid var(--admin-border)";
    dayBox.style.borderRadius = "10px";
    dayBox.style.overflow = "hidden";
    
    let itemsHtml = "";
    groups[date].forEach(o => {
      itemsHtml += `
        <div style="padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--admin-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 150ms;" class="cal-row" onclick='openOrderDrawerById(${o.id})'>
          <div>
            <span style="font-size: 0.82rem; font-weight: 700; color: #059669;">⏰ ${o.time_slot}</span> — 
            <strong>${o.service_title}</strong> hos <strong>${o.customer_name}</strong> (${o.street_address}, ${o.postal_code})
          </div>
          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <span style="font-size: 0.85rem; font-weight: 700;">${formatNOK(o.total_price)}</span>
            <span class="status-badge ${getStatusBadgeClass(o.status)}">${o.status}</span>
          </div>
        </div>
      `;
    });
    
    dayBox.innerHTML = `
      <div style="background: #F8FAFC; padding: 0.75rem 1.25rem; font-weight: 800; border-bottom: 1px solid var(--admin-border); color: #0F172A;">
        📅 ${date} (${groups[date].length} oppdrag)
      </div>
      <div>${itemsHtml}</div>
    `;
    
    container.appendChild(dayBox);
  });
}

// 6. Fetch and render Services CMS
async function loadServicesCMS() {
  try {
    const res = await fetch("/api/catalog");
    if (!res.ok) return;
    const data = await res.json();
    allServices = data.services || [];
    
    const container = document.getElementById("services-cms-grid");
    document.getElementById("services-count-admin").textContent = `${allServices.length} aktive tjenester`;
    
    container.innerHTML = "";
    allServices.forEach(s => {
      const card = document.createElement("div");
      card.className = "service-cms-card";
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #059669; text-transform: uppercase;">${s.category}</span>
            <span style="font-size: 0.75rem; color: #64748B;">ID: ${s.handle}</span>
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: #0F172A; margin-bottom: 0.5rem;">${s.title}</h4>
          <p style="font-size: 0.82rem; color: #64748B; margin-bottom: 1rem; line-height: 1.4;">${s.short_description}</p>
        </div>
        
        <div style="border-top: 1px solid var(--admin-border); padding-top: 0.85rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
            <label style="font-size: 0.8rem; font-weight: 700; color: #475569;">Fastpris fra (NOK):</label>
            <input type="number" id="cms-price-${s.handle}" value="${Math.round(s.price_from)}" style="width: 110px; height: 36px; padding: 0 0.5rem; border-radius: 6px; border: 1px solid var(--admin-border); font-weight: 700; text-align: right;">
          </div>
          <button onclick="saveServicePrice('${s.handle}')" style="width: 100%; height: 36px; background: #0F172A; color: white; border: none; border-radius: 6px; font-size: 0.82rem; font-weight: 700; cursor: pointer;">
            💾 Oppdater fastpris
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

// Save Service Price
async function saveServicePrice(handle) {
  const input = document.getElementById(`cms-price-${handle}`);
  const newPrice = parseFloat(input.value);
  if (isNaN(newPrice) || newPrice < 0) {
    alert("Vennligst oppgi en gyldig pris.");
    return;
  }
  
  try {
    const res = await fetch(`/api/services/${handle}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_from: newPrice })
    });
    if (!res.ok) throw new Error("Feil ved oppdatering");
    alert(`Fastpris for '${handle}' ble oppdatert til kr ${newPrice},-!`);
    loadStats();
  } catch (err) {
    alert("Kunne ikke oppdatere prisen.");
  }
}

// 7. Order Detail Drawer
function openOrderDrawer(order) {
  activeOrder = order;
  
  document.getElementById("drawer-status-badge").className = `status-badge ${getStatusBadgeClass(order.status)}`;
  document.getElementById("drawer-status-badge").textContent = order.status;
  document.getElementById("drawer-order-id").textContent = order.order_number;
  document.getElementById("drawer-service-title").textContent = order.service_title;
  document.getElementById("drawer-total-price").textContent = formatNOK(order.total_price);
  
  document.getElementById("drawer-customer-name").textContent = order.customer_name;
  
  const phoneLink = document.getElementById("drawer-customer-phone");
  phoneLink.textContent = `📞 ${order.customer_phone}`;
  phoneLink.href = `tel:${order.customer_phone.replace(/\s+/g, '')}`;
  
  document.getElementById("drawer-customer-email").textContent = order.customer_email;
  
  const mapLink = document.getElementById("drawer-address-map");
  mapLink.textContent = `📍 ${order.street_address}, ${order.postal_code} ${order.city}`;
  mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.street_address + ' ' + order.postal_code + ' ' + order.city)}`;
  
  document.getElementById("drawer-datetime").textContent = `${order.preferred_date} (${order.time_slot})`;
  document.getElementById("drawer-variant").textContent = order.variant_name || "Standard";
  
  const addonsWrap = document.getElementById("drawer-addons-wrap");
  addonsWrap.innerHTML = "";
  if (order.selected_options && order.selected_options.length > 0) {
    let addHtml = "<span style='font-size: 0.8rem; font-weight: 700; color: #64748B;'>Valgte tillegg:</span><ul style='padding-left: 1.2rem; font-size: 0.85rem; margin-top: 0.25rem;'>";
    order.selected_options.forEach(opt => {
      addHtml += `<li>${opt.name} (${formatNOK(opt.price)})</li>`;
    });
    addHtml += "</ul>";
    addonsWrap.innerHTML = addHtml;
  }
  
  document.getElementById("drawer-notes").textContent = order.notes || "Ingen merknad oppgitt.";
  
  document.getElementById("drawer-assignee-select").value = order.assigned_handyman || "Ikke tildelt";
  document.getElementById("drawer-status-select").value = order.status || "Ny bestilling";
  document.getElementById("drawer-handyman-notes").value = order.handyman_notes || "";
  
  document.getElementById("order-drawer").classList.add("active");
  document.getElementById("order-drawer").setAttribute("aria-hidden", "false");
}

function openOrderDrawerById(id) {
  const o = allOrders.find(x => x.id === id);
  if (o) openOrderDrawer(o);
}

function closeOrderDrawer() {
  document.getElementById("order-drawer").classList.remove("active");
  document.getElementById("order-drawer").setAttribute("aria-hidden", "true");
}

document.getElementById("drawer-close-btn").addEventListener("click", closeOrderDrawer);
document.getElementById("order-drawer").addEventListener("click", (e) => {
  if (e.target === document.getElementById("order-drawer")) closeOrderDrawer();
});

// Save Order Updates
document.getElementById("btn-save-order-updates").addEventListener("click", async () => {
  if (!activeOrder) return;
  
  const newStatus = document.getElementById("drawer-status-select").value;
  const newHandyman = document.getElementById("drawer-assignee-select").value;
  const newNotes = document.getElementById("drawer-handyman-notes").value;
  
  try {
    const res = await fetch(`/api/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        assigned_handyman: newHandyman,
        handyman_notes: newNotes
      })
    });
    
    if (!res.ok) throw new Error("Feil ved lagring");
    closeOrderDrawer();
    loadOrders();
    loadStats();
  } catch (err) {
    alert("Kunne ikke lagre oppdateringene.");
  }
});

// View Navigation Switcher
document.querySelectorAll(".admin-nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-nav-item[data-view]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    
    const view = btn.dataset.view;
    currentView = view;
    
    document.getElementById("view-orders").style.display = view === "orders" ? "block" : "none";
    document.getElementById("view-calendar").style.display = view === "calendar" ? "block" : "none";
    document.getElementById("view-services").style.display = view === "services" ? "block" : "none";
    document.getElementById("view-stats").style.display = view === "stats" ? "block" : "none";
    
    if (view === "orders") document.getElementById("admin-view-title").textContent = "Oppdrag & Ordrer";
    else if (view === "calendar") document.getElementById("admin-view-title").textContent = "Dagsplan & Ruteoversikt";
    else if (view === "services") {
      document.getElementById("admin-view-title").textContent = "Tjenester & Fastpriser (CMS)";
      loadServicesCMS();
    } else if (view === "stats") document.getElementById("admin-view-title").textContent = "Nøkkeltall & Analyse";
  });
});

// Filter Tabs (Status)
document.querySelectorAll(".filter-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilterStatus = btn.dataset.status;
    loadOrders();
  });
});

// View Switcher: Kanban vs Table
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

// Search & Refresh
document.getElementById("admin-search").addEventListener("input", () => {
  loadOrders();
});

document.getElementById("btn-refresh-admin").addEventListener("click", () => {
  loadStats();
  loadOrders();
  if (currentView === "services") loadServicesCMS();
});

// Initialize on load
loadStats();
loadOrders();
