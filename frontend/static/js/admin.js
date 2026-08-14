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

// Check & Apply Auth UI & Role-Based Permissions
function checkStaffAuth() {
  const overlay = document.getElementById("admin-auth-overlay");
  if (!currentStaffUser) {
    if (overlay) overlay.style.display = "flex";
    return;
  }
  
  if (overlay) overlay.style.display = "none";
  
  const roleBadge = document.getElementById("current-user-role-badge");
  const userName = document.getElementById("admin-user-name");
  const userEmail = document.getElementById("admin-user-email");
  const avatarBadge = document.getElementById("admin-avatar-badge");
  
  if (userName) userName.textContent = currentStaffUser.full_name;
  if (userEmail) userEmail.textContent = currentStaffUser.email;
  
  const isAdmin = currentStaffUser.role === "admin";
  
  // Show / Hide Admin-restricted navigation & elements
  document.querySelectorAll("[data-role='admin']").forEach(el => {
    el.style.display = isAdmin ? "" : "none";
  });
  
  const kpiSection = document.getElementById("admin-top-kpi-section");
  if (kpiSection) kpiSection.style.display = isAdmin ? "grid" : "none";
  
  const btnAiKey = document.getElementById("btn-open-ai-settings");
  if (btnAiKey) btnAiKey.style.display = isAdmin ? "flex" : "none";

  const navCalLabel = document.getElementById("nav-calendar-label");
  const navProfLabel = document.getElementById("nav-profile-label");
  
  if (isAdmin) {
    if (roleBadge) {
      roleBadge.textContent = "👑 Administrator";
      roleBadge.style.background = "#FEF3C7";
      roleBadge.style.color = "#92400E";
    }
    if (avatarBadge) avatarBadge.textContent = "👑";
    if (navCalLabel) navCalLabel.textContent = "Dagsplan & Vaktliste";
    if (navProfLabel) navProfLabel.textContent = "Håndverkerprofiler";
  } else {
    if (roleBadge) {
      roleBadge.textContent = `👷 Håndverker: ${currentStaffUser.full_name}`;
      roleBadge.style.background = "#EFF6FF";
      roleBadge.style.color = "#1D4ED8";
    }
    if (avatarBadge) avatarBadge.textContent = currentStaffUser.avatar_url || "👷";
    if (navCalLabel) navCalLabel.textContent = "Min Vaktliste & Dagsplan";
    if (navProfLabel) navProfLabel.textContent = "Mine Oppdrag & Profil";
    
    // If handyman is currently on an admin-restricted view, redirect to my-profile
    const adminRestrictedViews = ["orders", "services", "employees", "stats"];
    if (adminRestrictedViews.includes(currentView)) {
      const myProfBtn = document.getElementById("nav-item-my-profile");
      if (myProfBtn) myProfBtn.click();
    }
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

// 5. Interactive Month & Day Dispatch Calendar Matrix
let currentCalMode = "month";
let currentCalYear = 2026;
let currentCalMonth = 8;
let currentCalendarDate = new Date().toISOString().split('T')[0];

function switchCalMode(mode) {
  currentCalMode = mode;
  const btnMonth = document.getElementById("btn-cal-mode-month");
  const btnDay = document.getElementById("btn-cal-mode-day");
  const wrapMonth = document.getElementById("cal-month-view-wrap");
  const wrapDay = document.getElementById("cal-day-view-wrap");

  if (mode === "month") {
    if (btnMonth) {
      btnMonth.classList.add("active");
      btnMonth.style.background = "#0F172A";
      btnMonth.style.color = "white";
      btnMonth.style.fontWeight = "700";
    }
    if (btnDay) {
      btnDay.classList.remove("active");
      btnDay.style.background = "transparent";
      btnDay.style.color = "#475569";
      btnDay.style.fontWeight = "600";
    }
    if (wrapMonth) wrapMonth.style.display = "block";
    if (wrapDay) wrapDay.style.display = "none";
    loadMonthCalendar();
  } else {
    if (btnDay) {
      btnDay.classList.add("active");
      btnDay.style.background = "#0F172A";
      btnDay.style.color = "white";
      btnDay.style.fontWeight = "700";
    }
    if (btnMonth) {
      btnMonth.classList.remove("active");
      btnMonth.style.background = "transparent";
      btnMonth.style.color = "#475569";
      btnMonth.style.fontWeight = "600";
    }
    if (wrapMonth) wrapMonth.style.display = "none";
    if (wrapDay) wrapDay.style.display = "block";
    loadCalendarDispatch();
  }
}

// 5A. Full Month-View Calendar
async function loadMonthCalendar() {
  const gridContainer = document.getElementById("cal-month-grid");
  if (!gridContainer) return;
  gridContainer.innerHTML = "<div style='grid-column: 1 / -1; text-align: center; color: #64748B; padding: 3rem;'>Laster inn månedsoversikt...</div>";

  const isAdmin = currentStaffUser && currentStaffUser.role === "admin";
  const handymanSelect = document.getElementById("cal-month-handyman-filter");
  const statusSelect = document.getElementById("cal-month-status-filter");

  if (!isAdmin) {
    if (handymanSelect) handymanSelect.style.display = "none";
  } else {
    if (handymanSelect) handymanSelect.style.display = "";
  }

  // Populate Handyman dropdown if needed
  if (isAdmin && handymanSelect && handymanSelect.children.length <= 1) {
    try {
      const eRes = await fetch("/api/employees");
      const eData = await eRes.json();
      const hList = (eData.employees || []).filter(x => x.role === "handyman");
      hList.forEach(h => {
        const opt = document.createElement("option");
        opt.value = h.full_name;
        opt.textContent = `👷 ${h.full_name} (${h.handyman_specialty || 'Handyman'})`;
        handymanSelect.appendChild(opt);
      });
    } catch(e) {}
  }

  const selectedHandymanFilter = isAdmin ? (handymanSelect ? handymanSelect.value : "alle") : currentStaffUser.full_name;
  const selectedStatusFilter = statusSelect ? statusSelect.value : "alle";

  try {
    const params = new URLSearchParams();
    params.append("year", currentCalYear);
    params.append("month", currentCalMonth);
    if (selectedHandymanFilter && selectedHandymanFilter !== "alle") params.append("handyman", selectedHandymanFilter);
    if (selectedStatusFilter && selectedStatusFilter !== "alle") params.append("status", selectedStatusFilter);

    const res = await fetch(`/api/calendar/month?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente månedskalender");

    // Update Header & KPI cards
    const monthTitleElem = document.getElementById("cal-month-title");
    const kpiJobsElem = document.getElementById("cal-month-kpi-jobs");
    const kpiRevElem = document.getElementById("cal-month-kpi-rev");
    const kpiUnassignedElem = document.getElementById("cal-month-kpi-unassigned");

    if (monthTitleElem) monthTitleElem.textContent = data.month_name;
    if (kpiJobsElem) kpiJobsElem.textContent = `${data.total_month_jobs} oppdrag`;
    if (kpiRevElem) kpiRevElem.textContent = formatNOK(data.total_month_revenue);
    if (kpiUnassignedElem) {
      kpiUnassignedElem.textContent = `${data.total_unassigned_jobs} ubesatte`;
      kpiUnassignedElem.style.color = data.total_unassigned_jobs > 0 ? "#DC2626" : "#059669";
    }

    // Build 7-column calendar grid
    let html = `
      <div class="month-cal-header-cell">Man</div>
      <div class="month-cal-header-cell">Tir</div>
      <div class="month-cal-header-cell">Ons</div>
      <div class="month-cal-header-cell">Tor</div>
      <div class="month-cal-header-cell">Fre</div>
      <div class="month-cal-header-cell" style="color: #64748B;">Lør</div>
      <div class="month-cal-header-cell" style="color: #64748B;">Søn</div>
    `;

    (data.days_grid || []).forEach(day => {
      const isOtherMonth = !day.is_current_month;
      const isToday = day.is_today;
      const dayJobs = day.jobs || [];

      let cellClasses = "month-cal-day-cell";
      if (isOtherMonth) cellClasses += " other-month";
      if (isToday) cellClasses += " is-today";

      let jobsHtml = "";
      const displayJobs = dayJobs.slice(0, 3);
      displayJobs.forEach(j => {
        let pillClass = "pill-general";
        let prefixIcon = "👤";
        const hName = j.assigned_handyman || "";

        if (j.is_unassigned) {
          pillClass = "pill-unassigned";
          prefixIcon = "🚨";
        } else if (hName.includes("Lars")) {
          pillClass = "pill-lars";
          prefixIcon = "👷";
        } else if (hName.includes("Erik")) {
          pillClass = "pill-erik";
          prefixIcon = "⚡";
        } else if (hName.includes("Magnus")) {
          pillClass = "pill-magnus";
          prefixIcon = "🔧";
        } else if (hName.includes("Thomas")) {
          pillClass = "pill-thomas";
          prefixIcon = "⏱️";
        }

        const shortHandyman = j.is_unassigned ? "Ubesatt" : (hName.split(" ")[0]);
        const shortTime = j.time_slot ? j.time_slot.split(" - ")[0] : "";

        jobsHtml += `
          <div class="month-cal-job-pill ${pillClass}" onclick="event.stopPropagation(); openOrderDrawer(${j.id});" title="${j.order_number}: ${j.service_title} - ${j.customer_name} (${j.street_address}) • ${j.time_slot} • ${formatNOK(j.total_price)}">
            <span>${prefixIcon} <strong>${shortTime}</strong> ${j.service_title} (${shortHandyman})</span>
          </div>
        `;
      });

      if (dayJobs.length > 3) {
        jobsHtml += `
          <div style="font-size: 0.72rem; font-weight: 700; color: #2563EB; margin-top: 0.15rem; text-align: center;">
            + ${dayJobs.length - 3} flere →
          </div>
        `;
      }

      html += `
        <div class="${cellClasses}" ${!isOtherMonth ? `onclick="goToDayDispatch('${day.date}')"` : ''}>
          <div class="month-cal-day-top">
            <span class="month-day-number">${day.day_number}</span>
            ${day.jobs_count > 0 ? `<span class="month-day-jobs-badge">${day.jobs_count} ${day.jobs_count === 1 ? 'oppdrag' : 'oppdrag'}</span>` : ''}
          </div>
          <div style="display: flex; flex-direction: column; flex: 1;">
            ${jobsHtml}
          </div>
        </div>
      `;
    });

    gridContainer.innerHTML = html;
  } catch (err) {
    gridContainer.innerHTML = `<div style="grid-column: 1 / -1; color: #DC2626; padding: 2rem;">Feil: ${err.message}</div>`;
  }
}

function goToDayDispatch(dateStr) {
  currentCalendarDate = dateStr;
  switchCalMode("day");
}

// 5B. Daily Dispatch Calendar & Vaktliste Matrix
async function loadCalendarDispatch() {
  const matrixContainer = document.getElementById("calendar-dispatch-matrix");
  if (!matrixContainer) return;
  matrixContainer.innerHTML = "<p style='color: #64748B; padding: 2rem;'>Laster inn dagsplan og kjøreruter...</p>";

  const isAdmin = currentStaffUser && currentStaffUser.role === "admin";
  const handymanSelect = document.getElementById("cal-handyman-filter");
  const headingElem = document.getElementById("dispatch-view-heading");
  const subheadElem = document.getElementById("dispatch-view-subhead");

  if (!isAdmin) {
    if (handymanSelect) handymanSelect.style.display = "none";
    if (headingElem) headingElem.textContent = "Min Vaktliste & Dagsplan";
    if (subheadElem) subheadElem.textContent = "Dine planlagte oppdrag, oppmøtetider, adresser og veibeskrivelser for dagen.";
  } else {
    if (handymanSelect) handymanSelect.style.display = "";
    if (headingElem) headingElem.textContent = "Håndverker Dagsplan & Vaktliste";
    if (subheadElem) subheadElem.textContent = "Full oversikt over oppdrag, tidsrom, adresser og kjøreruter for alle håndverkere.";
  }

  // Populate Handyman dropdown if needed
  if (isAdmin && handymanSelect && handymanSelect.children.length <= 1) {
    try {
      const eRes = await fetch("/api/employees");
      const eData = await eRes.json();
      const hList = (eData.employees || []).filter(x => x.role === "handyman");
      hList.forEach(h => {
        const opt = document.createElement("option");
        opt.value = h.full_name;
        opt.textContent = `👷 ${h.full_name} (${h.handyman_specialty || 'Handyman'})`;
        handymanSelect.appendChild(opt);
      });
    } catch(e) {}
  }

  const selectedHandymanFilter = isAdmin ? (handymanSelect ? handymanSelect.value : "alle") : currentStaffUser.full_name;

  try {
    const params = new URLSearchParams();
    if (currentCalendarDate) params.append("date", currentCalendarDate);
    if (selectedHandymanFilter && selectedHandymanFilter !== "alle") params.append("handyman", selectedHandymanFilter);

    const res = await fetch(`/api/calendar/dispatch?${params.toString()}`);
    const data = await res.json();

    const displayDateElem = document.getElementById("cal-display-date");
    const totalJobsElem = document.getElementById("cal-total-jobs");
    const activeHandymenElem = document.getElementById("cal-active-handymen-count");
    const dateInput = document.getElementById("cal-date-input");

    if (dateInput) dateInput.value = data.date || currentCalendarDate;

    // Formatting date label
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    let dateLabel = data.date;
    if (data.date === todayStr) dateLabel = "I dag (" + data.date + ")";
    else if (data.date === tomorrowStr) dateLabel = "I morgen (" + data.date + ")";

    if (displayDateElem) displayDateElem.textContent = dateLabel;
    if (totalJobsElem) totalJobsElem.textContent = `${data.total_jobs} oppdrag`;
    
    const activeCount = (data.schedules || []).filter(s => s.jobs && s.jobs.length > 0).length;
    if (activeHandymenElem) activeHandymenElem.textContent = `${activeCount} på jobb`;

    // Unassigned orders alert (admin only)
    const unassignedBanner = document.getElementById("cal-unassigned-banner");
    const unassignedList = document.getElementById("cal-unassigned-list");
    const unassignedMsg = document.getElementById("cal-unassigned-msg");
    const unassignedJobs = data.unassigned_jobs || [];

    if (isAdmin && unassignedJobs.length > 0 && unassignedBanner) {
      unassignedBanner.style.display = "block";
      if (unassignedMsg) unassignedMsg.textContent = `🚨 ${unassignedJobs.length} oppdrag på denne datoen mangler tildelt håndverker!`;
      if (unassignedList) {
        unassignedList.innerHTML = unassignedJobs.map(uj => `
          <div style="background: white; border: 1px solid #FCA5A5; border-radius: 8px; padding: 0.65rem 0.85rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <div>
              <strong style="color: #991B1B;">${uj.order_number}</strong> — <strong>${uj.service_title}</strong>
              <span style="font-size: 0.8rem; color: #475569; display: block;">📍 ${uj.full_address} • ⏰ ${uj.time_slot}</span>
            </div>
            <button class="btn-primary-sm" onclick="openOrderDrawer(${uj.id})" style="background: #991B1B; color: white; border: none; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">
              👷 Tildel håndverker →
            </button>
          </div>
        `).join("");
      }
    } else if (unassignedBanner) {
      unassignedBanner.style.display = "none";
    }

    // Render Handymen Schedules Matrix
    const schedules = data.schedules || [];
    if (schedules.length === 0) {
      matrixContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem; background: #F8FAFC; border: 1px dashed var(--admin-border); border-radius: 12px;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">📅</span>
          <h4 style="font-weight: 700; color: #0F172A; margin-bottom: 0.25rem;">Ingen oppdrag satt opp denne dagen</h4>
          <p style="font-size: 0.85rem; color: #64748B;">Velg en annen dato eller opprett nye bestillinger i butikken.</p>
        </div>
      `;
      return;
    }

    matrixContainer.innerHTML = schedules.map(s => {
      const hasJobs = s.jobs && s.jobs.length > 0;
      
      let jobsHtml = "";
      if (!hasJobs) {
        jobsHtml = `
          <div style="background: #F8FAFC; border: 1px dashed var(--admin-border); border-radius: 10px; padding: 1.25rem; text-align: center; color: #64748B; font-size: 0.85rem; margin-top: 0.85rem;">
            Ingen oppdrag tildelt ${s.handyman_name} på denne datoen. (Ledig kapasitet)
          </div>
        `;
      } else {
        jobsHtml = `
          <div class="dispatch-stops-timeline">
            ${s.jobs.map((j, idx) => `
              <div class="dispatch-stop-card">
                <div class="stop-sequence-badge">${idx + 1}</div>
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.4rem; gap: 0.5rem; flex-wrap: wrap;">
                  <div>
                    <span style="font-size: 0.82rem; font-weight: 800; color: #3B82F6; background: #EFF6FF; padding: 0.15rem 0.5rem; border-radius: 4px; display: inline-block; margin-bottom: 0.2rem;">
                      ⏰ ${j.time_slot} (Est. ${j.estimated_hours}t)
                    </span>
                    <h4 style="font-size: 1.05rem; font-weight: 800; color: #0F172A; margin: 0.15rem 0;">
                      ${j.service_title}
                    </h4>
                  </div>
                  <span class="status-badge ${getStatusBadgeClass(j.status)}">${j.status}</span>
                </div>

                <div style="font-size: 0.84rem; color: #475569; margin-bottom: 0.75rem; line-height: 1.5;">
                  <div>📍 <strong>Adresse:</strong> <a href="${j.map_url}" target="_blank" style="color: #2563EB; font-weight: 700; text-decoration: underline;">${j.full_address} ↗</a></div>
                  <div>👤 <strong>Kunde:</strong> ${j.customer_name} &nbsp;|&nbsp; 📞 <a href="tel:${j.customer_phone.replace(/\s+/g, '')}" style="color: #059669; font-weight: 700;">${j.customer_phone}</a></div>
                  ${j.notes ? `<div style="margin-top: 0.25rem; font-style: italic; color: #64748B;">📝 "${j.notes}"</div>` : ''}
                </div>

                <!-- Quick Action Row -->
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; border-top: 1px solid #E2E8F0; padding-top: 0.6rem;">
                  <button class="btn-primary-sm btn-cal-set-status" data-id="${j.id}" data-status="På vei" style="background: #F59E0B; color: white; border: none; padding: 0.3rem 0.6rem; font-size: 0.74rem; border-radius: 5px; font-weight: 700; cursor: pointer;">
                    🚗 På vei
                  </button>
                  <button class="btn-primary-sm btn-cal-set-status" data-id="${j.id}" data-status="Pågår" style="background: #3B82F6; color: white; border: none; padding: 0.3rem 0.6rem; font-size: 0.74rem; border-radius: 5px; font-weight: 700; cursor: pointer;">
                    🔨 Pågår / Startet
                  </button>
                  <button class="btn-primary-sm btn-cal-set-status" data-id="${j.id}" data-status="Utført" style="background: #10B981; color: white; border: none; padding: 0.3rem 0.6rem; font-size: 0.74rem; border-radius: 5px; font-weight: 700; cursor: pointer;">
                    ✅ Utført
                  </button>
                  <button class="btn-primary-sm" onclick="openOrderDrawer(${j.id})" style="background: #0F172A; color: white; border: none; padding: 0.3rem 0.6rem; font-size: 0.74rem; border-radius: 5px; font-weight: 700; cursor: pointer; margin-left: auto;">
                    💬 Se full ordre & chat →
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }

      return `
        <div class="dispatch-handyman-card">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--admin-border); padding-bottom: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="font-size: 2.2rem; background: #F1F5F9; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid var(--admin-border);">
                ${s.avatar_url || '👷'}
              </div>
              <div>
                <h4 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0 0 0.15rem;">
                  ${s.handyman_name}
                </h4>
                <span style="font-size: 0.8rem; color: #64748B; font-weight: 600;">
                  ${s.specialty} &nbsp;•&nbsp; 📞 ${s.phone || 'Ingen telefon'}
                </span>
              </div>
            </div>

            <div style="text-align: right;">
              <span style="font-size: 0.85rem; font-weight: 700; color: #0F172A; background: #F1F5F9; padding: 0.3rem 0.7rem; border-radius: 9999px; border: 1px solid var(--admin-border);">
                📍 ${s.total_jobs} ${s.total_jobs === 1 ? 'oppdrag' : 'oppdrag'} • ${s.estimated_daily_hours}t arbeid
              </span>
            </div>
          </div>

          ${jobsHtml}
        </div>
      `;
    }).join("");

    // Attach Status Update buttons
    document.querySelectorAll(".btn-cal-set-status").forEach(btn => {
      btn.addEventListener("click", async () => {
        const orderId = btn.dataset.id;
        const newStatus = btn.dataset.status;
        try {
          const res = await fetch(`/api/orders/${orderId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, note: `Status endret til ${newStatus} fra vaktliste.` })
          });
          if (!res.ok) throw new Error("Kunne ikke endre status.");
          loadCalendarDispatch();
          loadOrders();
        } catch (err) {
          alert(err.message);
        }
      });
    });

  } catch (err) {
    matrixContainer.innerHTML = `<p style="color: #DC2626;">Kunne ikke laste vaktliste: ${err.message}</p>`;
  }
}

// Calendar Date & Filter Event Listeners
document.querySelectorAll(".btn-cal-quick-date").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".btn-cal-quick-date").forEach(x => x.classList.remove("active", "btn-primary"));
    b.classList.add("active");
    
    if (b.dataset.date === "today") {
      currentCalendarDate = new Date().toISOString().split('T')[0];
    } else if (b.dataset.date === "tomorrow") {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      currentCalendarDate = tom.toISOString().split('T')[0];
    }
    loadCalendarDispatch();
  });
});

const calDateInput = document.getElementById("cal-date-input");
if (calDateInput) {
  calDateInput.addEventListener("change", (e) => {
    currentCalendarDate = e.target.value;
    document.querySelectorAll(".btn-cal-quick-date").forEach(x => x.classList.remove("active"));
    loadCalendarDispatch();
  });
}

const calHandymanFilter = document.getElementById("cal-handyman-filter");
if (calHandymanFilter) {
  calHandymanFilter.addEventListener("change", () => {
    loadCalendarDispatch();
  });
}

// Month Calendar Controls & Navigation Listeners
const btnCalModeMonth = document.getElementById("btn-cal-mode-month");
const btnCalModeDay = document.getElementById("btn-cal-mode-day");
const btnCalPrevMonth = document.getElementById("btn-cal-prev-month");
const btnCalNextMonth = document.getElementById("btn-cal-next-month");
const btnCalCurrentMonth = document.getElementById("btn-cal-current-month");
const calMonthHandymanFilter = document.getElementById("cal-month-handyman-filter");
const calMonthStatusFilter = document.getElementById("cal-month-status-filter");

if (btnCalModeMonth) {
  btnCalModeMonth.addEventListener("click", () => switchCalMode("month"));
}
if (btnCalModeDay) {
  btnCalModeDay.addEventListener("click", () => switchCalMode("day"));
}
if (btnCalPrevMonth) {
  btnCalPrevMonth.addEventListener("click", () => {
    currentCalMonth--;
    if (currentCalMonth < 1) {
      currentCalMonth = 12;
      currentCalYear--;
    }
    loadMonthCalendar();
  });
}
if (btnCalNextMonth) {
  btnCalNextMonth.addEventListener("click", () => {
    currentCalMonth++;
    if (currentCalMonth > 12) {
      currentCalMonth = 1;
      currentCalYear++;
    }
    loadMonthCalendar();
  });
}
if (btnCalCurrentMonth) {
  btnCalCurrentMonth.addEventListener("click", () => {
    const now = new Date();
    currentCalYear = now.getFullYear();
    currentCalMonth = now.getMonth() + 1;
    loadMonthCalendar();
  });
}
if (calMonthHandymanFilter) {
  calMonthHandymanFilter.addEventListener("change", () => loadMonthCalendar());
}
if (calMonthStatusFilter) {
  calMonthStatusFilter.addEventListener("change", () => loadMonthCalendar());
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
    if (drawer) {
      drawer.style.display = "flex";
      drawer.classList.add("active");
      drawer.setAttribute("aria-hidden", "false");
    }
  } catch (err) {
    alert(err.message);
  }
}

// Close Drawer
function closeOrderDrawer() {
  const drawer = document.getElementById("order-drawer");
  if (drawer) {
    drawer.classList.remove("active");
    drawer.style.display = "none";
    drawer.setAttribute("aria-hidden", "true");
  }
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
    document.getElementById("view-docs").style.display = currentView === "docs" ? "block" : "none";
    document.getElementById("view-employees").style.display = currentView === "employees" ? "block" : "none";
    document.getElementById("view-accounting").style.display = currentView === "accounting" ? "block" : "none";
    document.getElementById("view-invoices").style.display = currentView === "invoices" ? "block" : "none";
    document.getElementById("view-my-profile").style.display = currentView === "my-profile" ? "block" : "none";
    document.getElementById("view-email").style.display = currentView === "email" ? "block" : "none";
    document.getElementById("view-stats").style.display = currentView === "stats" ? "block" : "none";
    
    if (currentView === "services") loadServicesCMS();
    if (currentView === "calendar") {
      if (currentCalMode === "month") loadMonthCalendar();
      else loadCalendarDispatch();
    }
    if (currentView === "docs") loadPdfDocs();
    if (currentView === "employees") loadEmployees();
    if (currentView === "accounting") loadAccountingSummary();
    if (currentView === "invoices") loadInvoices();
    if (currentView === "my-profile") loadHandymanProfile();
    if (currentView === "email") loadEmails();
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
    if (aiCreatorModal) {
      aiCreatorModal.style.display = "flex";
      aiCreatorModal.classList.add("active");
    }
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
  if (aiCreatorModal) {
    aiCreatorModal.classList.remove("active");
    aiCreatorModal.style.display = "none";
  }
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
    if (aiConfigModal) {
      aiConfigModal.style.display = "flex";
      aiConfigModal.classList.add("active");
    }
    inputGeminiApiKey.value = "";
    checkAiConfigStatus();
    setTimeout(() => inputGeminiApiKey.focus(), 150);
  });
}

if (btnCloseAiConfig) {
  btnCloseAiConfig.addEventListener("click", () => {
    if (aiConfigModal) {
      aiConfigModal.classList.remove("active");
      aiConfigModal.style.display = "none";
    }
  });
}

if (aiConfigModal) {
  aiConfigModal.addEventListener("click", (e) => {
    if (e.target === aiConfigModal) {
      aiConfigModal.classList.remove("active");
      aiConfigModal.style.display = "none";
    }
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

// ==========================================================================
// 11. PDF DOCUMENTATION & HANDYMAN MANUALS CONTROLLER
// ==========================================================================

const docsGridContainer = document.getElementById("docs-grid-container");
const docsCountBadge = document.getElementById("docs-count-badge");
const docsSearchInput = document.getElementById("docs-search-input");
const docsCategoryFilter = document.getElementById("docs-category-filter");
const docsTypeFilter = document.getElementById("docs-type-filter");

const pdfViewerModal = document.getElementById("pdf-viewer-modal");
const pdfViewerTitle = document.getElementById("pdf-viewer-title");
const pdfViewerSubtitle = document.getElementById("pdf-viewer-subtitle");
const pdfDirectDownloadBtn = document.getElementById("pdf-direct-download-btn");
const pdfOpenNewTabBtn = document.getElementById("pdf-open-new-tab-btn");
const pdfIframeElement = document.getElementById("pdf-iframe-element");
const btnClosePdfViewer = document.getElementById("btn-close-pdf-viewer");

let allPdfDocs = [];

async function loadPdfDocs() {
  if (!docsGridContainer) return;
  docsGridContainer.innerHTML = "<p style='color: #64748B; padding: 2rem;'>Laster inn PDF-dokumenter...</p>";

  const search = docsSearchInput ? docsSearchInput.value.trim() : "";
  const category = docsCategoryFilter ? docsCategoryFilter.value : "alle";
  const docType = docsTypeFilter ? docsTypeFilter.value : "alle";

  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (category && category !== "alle") params.append("category", category);
  if (docType && docType !== "alle") params.append("doc_type", docType);

  try {
    const res = await fetch(`/api/docs/list?${params.toString()}`);
    const data = await res.json();
    allPdfDocs = data.docs || [];

    if (docsCountBadge) {
      docsCountBadge.textContent = `${allPdfDocs.length} dokumenter`;
    }

    if (allPdfDocs.length === 0) {
      docsGridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: #F8FAFC; border: 1px dashed var(--admin-border); border-radius: 12px;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🔍</span>
          <h4 style="font-weight: 700; color: #0F172A; margin-bottom: 0.25rem;">Ingen dokumenter funnet</h4>
          <p style="font-size: 0.85rem; color: #64748B;">Prøv å endre søkeord eller tilbakestill kategorifilteret.</p>
        </div>
      `;
      return;
    }

    docsGridContainer.innerHTML = allPdfDocs.map(doc => {
      const isSop = doc.doc_type === "SOP / Sjekkliste";
      const badgeClass = isSop ? "badge-sop" : "badge-product-info";
      const badgeIcon = isSop ? "🛠️" : "📄";

      return `
        <div class="doc-pdf-card">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem;">
              <span class="${badgeClass}">${badgeIcon} ${doc.doc_type}</span>
              <span style="font-size: 0.72rem; color: #64748B; font-weight: 600;">${doc.size_kb} KB</span>
            </div>

            <h4 style="font-size: 0.98rem; font-weight: 700; color: #0F172A; margin: 0 0 0.35rem; line-height: 1.35;">
              ${doc.title}
            </h4>

            <div style="font-size: 0.78rem; color: #64748B; margin-bottom: 0.85rem;">
              <strong>Kategori:</strong> ${doc.category}
              ${doc.service_folder ? `<br><strong>Tjeneste:</strong> ${doc.service_folder}` : ''}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; border-top: 1px solid var(--admin-border); padding-top: 0.75rem;">
            <button class="btn-doc-action btn-view-pdf-action" 
              data-url="${doc.url}" 
              data-title="${escapeHtml(doc.title)}" 
              data-category="${escapeHtml(doc.category)}" 
              style="background: #0F172A; color: white; border: none;">
              👁️ Åpne / Les
            </button>
            <a class="btn-doc-action" href="${doc.url}" target="_blank" download style="background: #F1F5F9; color: #0F172A; border: 1px solid var(--admin-border);">
              ⬇️ Last ned
            </a>
          </div>
        </div>
      `;
    }).join("");

    // Attach click listeners to all view buttons
    document.querySelectorAll(".btn-view-pdf-action").forEach(btn => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-url");
        const title = btn.getAttribute("data-title");
        const category = btn.getAttribute("data-category");
        openPdfViewerModal(url, title, category);
      });
    });

  } catch (err) {
    docsGridContainer.innerHTML = `<p style="color: #DC2626;">Feil ved innlasting av dokumenter: ${err.message}</p>`;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function openPdfViewerModal(url, title, category) {
  const modal = document.getElementById("pdf-viewer-modal");
  if (!modal) return;
  if (pdfViewerTitle) pdfViewerTitle.textContent = title;
  if (pdfViewerSubtitle) pdfViewerSubtitle.textContent = `Kategori: ${category} • Servida Håndbok`;
  if (pdfDirectDownloadBtn) pdfDirectDownloadBtn.href = url;
  if (pdfOpenNewTabBtn) pdfOpenNewTabBtn.href = url;
  if (pdfIframeElement) pdfIframeElement.src = url;
  modal.style.display = "flex";
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closePdfViewerModal() {
  const modal = document.getElementById("pdf-viewer-modal");
  if (!modal) return;
  if (pdfIframeElement) pdfIframeElement.src = "about:blank";
  modal.classList.remove("active");
  modal.style.display = "none";
  document.body.style.overflow = "";
}

if (btnClosePdfViewer) btnClosePdfViewer.addEventListener("click", closePdfViewerModal);
if (pdfViewerModal) {
  pdfViewerModal.addEventListener("click", (e) => {
    if (e.target === pdfViewerModal) closePdfViewerModal();
  });
}

// Search and filter event listeners for docs
if (docsSearchInput) {
  docsSearchInput.addEventListener("input", () => loadPdfDocs());
}
if (docsCategoryFilter) {
  docsCategoryFilter.addEventListener("change", () => loadPdfDocs());
}
if (docsTypeFilter) {
  docsTypeFilter.addEventListener("change", () => loadPdfDocs());
}


// ==========================================================================
// 12. EMPLOYEE MANAGEMENT & WORK HOURS CONTROLLER
// ==========================================================================

let allEmployees = [];
let selectedHandymanId = null;

const employeesCardsGrid = document.getElementById("employees-cards-grid");
const empSearchInput = document.getElementById("employee-search-input");
const empPctFilter = document.getElementById("employee-pct-filter");
const empBalanceFilter = document.getElementById("employee-balance-filter");

const modalCreateEmployee = document.getElementById("modal-create-employee");
const btnOpenCreateEmployeeModal = document.getElementById("btn-open-create-employee-modal");
const btnCloseCreateEmployee = document.getElementById("btn-close-create-employee");
const formCreateEmployee = document.getElementById("form-create-employee");

const modalLogHours = document.getElementById("modal-log-hours");
const btnCloseLogHours = document.getElementById("btn-close-log-hours");
const formAdminLogHours = document.getElementById("form-admin-log-hours");

const modalEditEmployee = document.getElementById("modal-edit-employee");
const btnCloseEditEmployee = document.getElementById("btn-close-edit-employee");
const formEditEmployee = document.getElementById("form-edit-employee");

async function loadEmployees() {
  if (!employeesCardsGrid) return;
  employeesCardsGrid.innerHTML = "<p style='color: #64748B; padding: 2rem;'>Laster inn ansatte og timelister...</p>";

  try {
    const res = await fetch("/api/employees");
    const data = await res.json();
    allEmployees = data.employees || [];

    // Filter employees
    const search = empSearchInput ? empSearchInput.value.trim().toLowerCase() : "";
    const pct = empPctFilter ? empPctFilter.value : "alle";
    const balance = empBalanceFilter ? empBalanceFilter.value : "alle";

    let filtered = allEmployees.filter(e => {
      if (search) {
        const matchesName = (e.full_name || "").toLowerCase().includes(search);
        const matchesSpec = (e.handyman_specialty || "").toLowerCase().includes(search);
        const matchesPhone = (e.phone || "").includes(search);
        if (!matchesName && !matchesSpec && !matchesPhone) return false;
      }
      if (pct === "100" && e.employment_percentage !== 100) return false;
      if (pct === "80" && e.employment_percentage !== 80) return false;
      if (pct === "50" && e.employment_percentage !== 50) return false;
      if ((pct === "0" || pct === "vikar") && e.employment_percentage !== 0) return false;
      if (pct === "del" && e.employment_percentage >= 100) return false;

      if (balance !== "alle" && e.balance_status !== balance) return false;

      return true;
    });

    // Update KPI counters
    const handymenOnly = allEmployees.filter(e => e.role === "handyman");
    const totalWorked = handymenOnly.reduce((acc, x) => acc + (x.worked_hours_this_week || 0), 0);
    const totalScheduled = handymenOnly.reduce((acc, x) => acc + (x.scheduled_hours_this_week || 0), 0);
    const totalOvertime = handymenOnly.reduce((acc, x) => acc + (x.time_balance > 0 && x.employment_percentage > 0 ? x.time_balance : 0), 0);

    const kpiTotal = document.getElementById("kpi-emp-total");
    const kpiWorked = document.getElementById("kpi-emp-worked-hours");
    const kpiScheduled = document.getElementById("kpi-emp-scheduled-hours");
    const kpiOvertime = document.getElementById("kpi-emp-overtime");

    if (kpiTotal) kpiTotal.textContent = handymenOnly.length;
    if (kpiWorked) kpiWorked.textContent = `${totalWorked.toFixed(1)}t`;
    if (kpiScheduled) kpiScheduled.textContent = `${totalScheduled.toFixed(1)}t`;
    if (kpiOvertime) kpiOvertime.textContent = `+${totalOvertime.toFixed(1)}t`;

    if (filtered.length === 0) {
      employeesCardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: #F8FAFC; border: 1px dashed var(--admin-border); border-radius: 12px;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🔍</span>
          <h4 style="font-weight: 700; color: #0F172A; margin-bottom: 0.25rem;">Ingen ansatte funnet</h4>
          <p style="font-size: 0.85rem; color: #64748B;">Prøv å endre søk eller tilbakestill filteret.</p>
        </div>
      `;
      return;
    }

    employeesCardsGrid.innerHTML = filtered.map(emp => {
      const isVikar = emp.employment_percentage === 0;
      const isOvertime = emp.time_balance > 0 && !isVikar;
      const isOnTrack = emp.time_balance === 0 && !isVikar;
      
      let badgeCls = "badge-undertime";
      let balanceIcon = "🟡";
      if (isVikar) {
        badgeCls = "badge-oncall";
        balanceIcon = "📞";
      } else if (isOvertime) {
        badgeCls = "badge-overtime";
        balanceIcon = "🟢";
      } else if (isOnTrack) {
        badgeCls = "badge-ontrack";
        balanceIcon = "🔵";
      }
      
      const pctFill = isVikar ? 100 : (emp.target_weekly_hours > 0 ? Math.min(Math.round((emp.worked_hours_this_week / emp.target_weekly_hours) * 100), 100) : 0);
      const progressColor = isVikar ? "#A855F7" : (isOvertime ? "#10B981" : (pctFill >= 80 ? "#3B82F6" : "#F59E0B"));

      return `
        <div class="employee-card">
          <div>
            <!-- Top Card Row -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="font-size: 2.2rem; background: #F1F5F9; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid var(--admin-border);">
                  ${emp.avatar_url || (isVikar ? '⏱️' : '👷')}
                </div>
                <div>
                  <h4 style="font-size: 1.05rem; font-weight: 800; color: #0F172A; margin: 0 0 0.15rem;">
                    ${emp.full_name}
                  </h4>
                  <span style="font-size: 0.78rem; color: #64748B; font-weight: 600;">
                    ${emp.handyman_specialty || (isVikar ? 'Tilkallingsvikar' : (emp.role === 'admin' ? 'Ledelse & Drift' : 'Allround Handyman'))}
                  </span>
                </div>
              </div>
              <span class="status-badge ${emp.status === 'På oppdrag' ? 'badge-tildelt' : (isVikar ? 'badge-oncall' : 'badge-bekreftet')}" style="font-size: 0.72rem;">
                ${emp.status || (isVikar ? 'Tilkalling' : 'Aktiv')}
              </span>
            </div>

            <!-- Employment Percentage & Contract Info -->
            <div style="background: #F8FAFC; border: 1px solid var(--admin-border); border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.85rem; font-size: 0.82rem; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: #0F172A;">${isVikar ? '📞 Tilkallingsvikar' : `${emp.employment_percentage}% Stilling`}</strong>
                <span style="color: #64748B; display: block; font-size: 0.75rem;">${isVikar ? 'Arbeid etter behov' : `Norm: <strong>${emp.target_weekly_hours}t</strong> / uke`}</span>
              </div>
              <div style="text-align: right;">
                <span class="${badgeCls}">${balanceIcon} ${emp.balance_label}</span>
              </div>
            </div>

            <!-- Weekly Progress Bar -->
            <div style="margin-bottom: 0.85rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.25rem;">
                ${isVikar 
                  ? `<span>Arbeidet: <strong>${emp.worked_hours_this_week}t</strong></span><span>Tilkallingsbasis</span>`
                  : `<span>Arbeidet: <strong>${emp.worked_hours_this_week}t</strong></span><span>Mål: ${emp.target_weekly_hours}t (${pctFill}%)</span>`
                }
              </div>
              <div class="time-progress-track">
                <div class="time-progress-fill" style="width: ${pctFill}%; background: ${progressColor};"></div>
              </div>
            </div>

            <!-- Contact & Schedule info -->
            <div style="font-size: 0.78rem; color: #64748B; margin-bottom: 1rem; line-height: 1.5;">
              <div>📞 <strong>${emp.phone || 'Ingen telefon'}</strong> &nbsp;|&nbsp; ✉️ ${emp.email}</div>
              <div>📅 Planlagt: <strong>${emp.scheduled_hours_this_week}t</strong> (${emp.active_orders_count} aktive oppdrag)</div>
            </div>
          </div>

          <!-- Actions Row -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1.1fr; gap: 0.35rem; border-top: 1px solid var(--admin-border); padding-top: 0.75rem;">
            <button class="btn-primary-sm btn-emp-log-hours" onclick="openAdminLogHoursModal(${emp.id}, '${emp.full_name}')" style="background: #059669; color: white; padding: 0.4rem 0.3rem; font-size: 0.74rem; border-radius: 6px; border: none; font-weight: 700; cursor: pointer;">
              ⏱️ Før timer
            </button>
            <button class="btn-primary-sm btn-emp-contract" onclick="openContractViewer(${emp.id})" style="background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; padding: 0.4rem 0.3rem; font-size: 0.74rem; border-radius: 6px; font-weight: 700; cursor: pointer;">
              📄 Kontrakt
            </button>
            <button class="btn-primary-sm btn-emp-edit" onclick="openEditEmployeeModalById(${emp.id})" style="background: #F1F5F9; color: #0F172A; border: 1px solid var(--admin-border); padding: 0.4rem 0.3rem; font-size: 0.74rem; border-radius: 6px; font-weight: 700; cursor: pointer;">
              ✏️ Rediger
            </button>
            <button class="btn-primary-sm btn-emp-view-profile" onclick="openHandymanProfileView(${emp.id})" style="background: #0F172A; color: white; padding: 0.4rem 0.3rem; font-size: 0.74rem; border-radius: 6px; border: none; font-weight: 700; cursor: pointer;">
              📋 Timekort →
            </button>
          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    employeesCardsGrid.innerHTML = `<p style="color: #DC2626;">Kunne ikke laste ansatte: ${err.message}</p>`;
  }
}

// Search and filter listeners for employees
if (empSearchInput) empSearchInput.addEventListener("input", () => loadEmployees());
if (empPctFilter) empPctFilter.addEventListener("change", () => loadEmployees());
if (empBalanceFilter) empBalanceFilter.addEventListener("change", () => loadEmployees());


// ==========================================================================
// 13. DEDICATED HANDYMAN PROFILE & PERSONAL TIMECARD CONTROLLER
// ==========================================================================

async function loadHandymanProfile(empId = null) {
  const targetId = empId || selectedHandymanId || currentStaffUser.id;
  if (!targetId) return;

  try {
    const res = await fetch(`/api/handyman/profile/${targetId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Kunne ikke laste profil");

    const prof = data.profile;
    const stats = data.stats;
    const assignedOrders = data.assigned_orders || [];
    const recentLogs = data.recent_hour_logs || [];

    // Header population
    if (document.getElementById("hp-avatar")) document.getElementById("hp-avatar").textContent = prof.avatar_url || '👷';
    if (document.getElementById("hp-name")) document.getElementById("hp-name").textContent = prof.full_name;
    if (document.getElementById("hp-status-badge")) {
      const sb = document.getElementById("hp-status-badge");
      sb.textContent = prof.status || "Aktiv";
      sb.className = `status-badge ${prof.status === 'På oppdrag' ? 'badge-tildelt' : 'badge-bekreftet'}`;
    }
    if (document.getElementById("hp-specialty")) document.getElementById("hp-specialty").textContent = prof.handyman_specialty || "Allround Handyman";
    if (document.getElementById("hp-phone")) document.getElementById("hp-phone").textContent = `📞 ${prof.phone || 'Ingen telefon'}`;
    if (document.getElementById("hp-email")) document.getElementById("hp-email").textContent = prof.email;
    if (document.getElementById("hp-pct-label")) {
      document.getElementById("hp-pct-label").textContent = `${prof.employment_percentage} % (${prof.target_weekly_hours}t / uke)`;
    }

    // Weekly progress & balance
    if (document.getElementById("hp-worked-hours-val")) document.getElementById("hp-worked-hours-val").textContent = `${stats.worked_hours.toFixed(1)}t`;
    if (document.getElementById("hp-target-hours-val")) document.getElementById("hp-target-hours-val").textContent = `${stats.target_hours.toFixed(1)}t`;
    
    if (document.getElementById("hp-balance-badge")) {
      const bb = document.getElementById("hp-balance-badge");
      if (stats.time_balance > 0) {
        bb.textContent = `🟢 +${stats.time_balance.toFixed(1)}t overtid denne uken`;
        bb.className = "badge-overtime";
      } else if (stats.time_balance === 0) {
        bb.textContent = `🔵 0.0t (Akkurat i rute 100%)`;
        bb.className = "badge-ontrack";
      } else {
        const remaining = Math.abs(stats.time_balance).toFixed(1);
        bb.textContent = `🟡 ${remaining}t gjenstår for å nå ukesmålet (${stats.target_hours}t)`;
        bb.className = "badge-undertime";
      }
    }

    if (document.getElementById("hp-progress-fill")) {
      document.getElementById("hp-progress-fill").style.width = `${stats.progress_pct}%`;
      document.getElementById("hp-progress-fill").style.background = stats.is_overtime ? "#10B981" : (stats.progress_pct >= 80 ? "#3B82F6" : "#F59E0B");
    }

    if (document.getElementById("hp-active-orders-count-badge")) {
      document.getElementById("hp-active-orders-count-badge").textContent = `${stats.active_orders_count} aktive oppdrag`;
    }

    // Render Assigned Orders List
    const ordersContainer = document.getElementById("hp-assigned-orders-list");
    if (ordersContainer) {
      if (assignedOrders.length === 0) {
        ordersContainer.innerHTML = `
          <div style="text-align: center; padding: 2.5rem; background: #F8FAFC; border: 1px dashed var(--admin-border); border-radius: 12px;">
            <span style="font-size: 2.2rem; display: block; margin-bottom: 0.35rem;">📋</span>
            <h4 style="font-weight: 700; color: #0F172A; margin-bottom: 0.25rem;">Ingen oppdrag tildelt</h4>
            <p style="font-size: 0.85rem; color: #64748B;">Når admin tildeler deg oppdrag, vil kjøreliste og kundedetaljer vises her.</p>
          </div>
        `;
      } else {
        ordersContainer.innerHTML = assignedOrders.map(o => {
          const mapQuery = encodeURIComponent(`${o.street_address}, ${o.postal_code} ${o.city}`);
          return `
            <div class="handyman-job-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                <div>
                  <span style="font-family: monospace; font-weight: 700; font-size: 0.8rem; color: #3B82F6;">${o.order_number}</span>
                  <h4 style="font-size: 1.05rem; font-weight: 800; color: #0F172A; margin: 0.2rem 0;">${o.service_title}</h4>
                </div>
                <span class="status-badge ${getStatusBadgeClass(o.status)}">${o.status}</span>
              </div>

              <div style="background: #F8FAFC; border: 1px solid var(--admin-border); border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.75rem; font-size: 0.82rem; line-height: 1.5;">
                <div>📅 <strong>${o.preferred_date}</strong> (${o.time_slot})</div>
                <div>👤 Kunde: <strong>${o.customer_name}</strong></div>
                <div>📍 <a href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" style="color: #3B82F6; font-weight: 600; text-decoration: underline;">${o.street_address}, ${o.postal_code} ${o.city} ↗</a></div>
                <div>📞 <a href="tel:${o.customer_phone.replace(/\s+/g, '')}" style="color: #059669; font-weight: 700;">${o.customer_phone}</a></div>
                ${o.notes ? `<div style="margin-top: 0.35rem; color: #475569; font-style: italic;">📝 "${o.notes}"</div>` : ''}
              </div>

              <!-- Quick Handyman Status Buttons -->
              <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                <button class="btn-primary-sm btn-hm-set-status" data-id="${o.id}" data-status="På vei" style="background: #F59E0B; color: white; border: none; padding: 0.35rem 0.65rem; font-size: 0.75rem; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  🚗 På vei
                </button>
                <button class="btn-primary-sm btn-hm-set-status" data-id="${o.id}" data-status="Pågår" style="background: #3B82F6; color: white; border: none; padding: 0.35rem 0.65rem; font-size: 0.75rem; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  🔨 Startet / Pågår
                </button>
                <button class="btn-primary-sm btn-hm-set-status" data-id="${o.id}" data-status="Utført" style="background: #10B981; color: white; border: none; padding: 0.35rem 0.65rem; font-size: 0.75rem; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  ✅ Fullført / Utført
                </button>
                <button class="btn-primary-sm" onclick="openOrderDrawer(${o.id})" style="background: #0F172A; color: white; border: none; padding: 0.35rem 0.65rem; font-size: 0.75rem; border-radius: 6px; font-weight: 700; cursor: pointer; margin-left: auto;">
                  💬 Dialog & Info →
                </button>
              </div>
            </div>
          `;
        }).join("");

        // Attach quick status buttons
        document.querySelectorAll(".btn-hm-set-status").forEach(b => {
          b.addEventListener("click", async () => {
            const orderId = b.dataset.id;
            const newStatus = b.dataset.status;
            try {
              const res = await fetch(`/api/orders/${orderId}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus, note: `Status endret til ${newStatus} av håndverker.` })
              });
              if (!res.ok) throw new Error("Kunne ikke endre status.");
              loadHandymanProfile(targetId);
              loadOrders();
            } catch (e) {
              alert(e.message);
            }
          });
        });
      }
    }

    // Render Recent Hour Logs History
    const logsContainer = document.getElementById("hp-hours-history-list");
    if (logsContainer) {
      if (recentLogs.length === 0) {
        logsContainer.innerHTML = `<span style="font-size: 0.8rem; color: #94A3B8; display: block; padding: 1rem; text-align: center;">Ingen loggede timer registrert enda.</span>`;
      } else {
        logsContainer.innerHTML = recentLogs.map(l => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.75rem; border-bottom: 1px solid #F1F5F9; font-size: 0.82rem;">
            <div>
              <strong style="color: #0F172A; display: block;">${l.description}</strong>
              <span style="font-size: 0.72rem; color: #64748B;">📅 ${l.work_date}</span>
            </div>
            <div style="text-align: right;">
              <strong style="font-size: 0.95rem; color: #059669;">${l.hours_spent}t</strong>
              <span style="font-size: 0.7rem; color: #10B981; display: block;">✓ Godkjent</span>
            </div>
          </div>
        `).join("");
      }
    }

    // Set today's date in quick log form
    const logDateInput = document.getElementById("hp-log-date");
    if (logDateInput && !logDateInput.value) {
      logDateInput.value = new Date().toISOString().split('T')[0];
    }

  } catch (err) {
    console.error("Feil ved lasting av håndverkerprofil:", err);
  }
}

// Handyman quick log hours form submit handler
const formHandymanLogHours = document.getElementById("form-handyman-log-hours");
if (formHandymanLogHours) {
  formHandymanLogHours.addEventListener("submit", async () => {
    const targetId = selectedHandymanId || currentStaffUser.id;
    const dateVal = document.getElementById("hp-log-date").value;
    const hoursVal = parseFloat(document.getElementById("hp-log-hours").value);
    const descVal = document.getElementById("hp-log-desc").value.trim();

    if (!hoursVal || !descVal) {
      alert("Vennligst oppgi timer og beskrivelse.");
      return;
    }

    const btnSubmit = document.getElementById("btn-submit-handyman-hours");
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Lagrer...";

    try {
      const res = await fetch(`/api/employees/${targetId}/hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: targetId,
          work_date: dateVal,
          hours_spent: hoursVal,
          description: descVal
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Feil ved lagring av timer.");

      document.getElementById("hp-log-hours").value = "";
      document.getElementById("hp-log-desc").value = "";
      alert("✓ Timene er registrert og oppdatert!");
      loadHandymanProfile(targetId);
      loadEmployees();
    } catch (err) {
      alert(err.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "💾 Registrer timer";
    }
  });
}

// Open / Close Create Employee Modal
if (btnOpenCreateEmployeeModal) {
  btnOpenCreateEmployeeModal.addEventListener("click", () => {
    modalCreateEmployee.classList.add("active");
    document.getElementById("new-emp-name").value = "";
    document.getElementById("new-emp-phone").value = "";
    document.getElementById("new-emp-email").value = "";
    document.getElementById("new-emp-password").value = "";
    document.getElementById("new-emp-specialty").value = "";
    document.getElementById("new-emp-bio").value = "";
    document.getElementById("create-emp-error-msg").style.display = "none";
    setTimeout(() => document.getElementById("new-emp-name").focus(), 150);
  });
}

function closeCreateEmployeeModal() {
  if (modalCreateEmployee) modalCreateEmployee.classList.remove("active");
}
if (btnCloseCreateEmployee) btnCloseCreateEmployee.addEventListener("click", closeCreateEmployeeModal);
if (modalCreateEmployee) {
  modalCreateEmployee.addEventListener("click", (e) => {
    if (e.target === modalCreateEmployee) closeCreateEmployeeModal();
  });
}

// Create Employee Form Submit Handler
if (formCreateEmployee) {
  formCreateEmployee.addEventListener("submit", async () => {
    const full_name = document.getElementById("new-emp-name").value.trim();
    const phone = document.getElementById("new-emp-phone").value.trim();
    const email = document.getElementById("new-emp-email").value.trim();
    const password = document.getElementById("new-emp-password").value.trim();
    const employment_percentage = parseInt(document.getElementById("new-emp-pct").value);
    const handyman_specialty = document.getElementById("new-emp-specialty").value.trim();
    const hourly_rate = parseFloat(document.getElementById("new-emp-rate").value) || 380;
    const avatar_url = document.getElementById("new-emp-avatar").value;
    const bio = document.getElementById("new-emp-bio").value.trim();
    const errBox = document.getElementById("create-emp-error-msg");

    if (!full_name || !email || !password) {
      errBox.textContent = "Vennligst fyll ut navn, e-post og passord.";
      errBox.style.display = "block";
      return;
    }

    const btnSub = document.getElementById("btn-submit-create-employee");
    btnSub.disabled = true;
    btnSub.textContent = "Oppretter...";

    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name, phone, email, password, employment_percentage,
          handyman_specialty, hourly_rate, avatar_url, bio
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke opprette ansatt.");

      alert(`✓ Håndverkerprofil for ${full_name} (${employment_percentage}% stilling) er opprettet!`);
      closeCreateEmployeeModal();
      loadEmployees();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = "block";
    } finally {
      btnSub.disabled = false;
      btnSub.textContent = "💾 Opprett håndverkerprofil";
    }
  });
}

// Admin Hour Logging Modal
function openAdminLogHoursModal(empId, empName) {
  const modal = document.getElementById("modal-log-hours");
  if (!modal) return;
  document.getElementById("admin-log-emp-id").value = empId;
  document.getElementById("modal-log-hours-title").textContent = `⏱️ Før timer for ${empName}`;
  document.getElementById("admin-log-date").value = new Date().toISOString().split('T')[0];
  document.getElementById("admin-log-hours-val").value = "";
  document.getElementById("admin-log-desc").value = "";
  modal.style.display = "flex";
  modal.classList.add("active");
  setTimeout(() => document.getElementById("admin-log-hours-val").focus(), 150);
}

function closeAdminLogHoursModal() {
  const modal = document.getElementById("modal-log-hours");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}
if (btnCloseLogHours) btnCloseLogHours.addEventListener("click", closeAdminLogHoursModal);
const modalLogHoursElem = document.getElementById("modal-log-hours");
if (modalLogHoursElem) {
  modalLogHoursElem.addEventListener("click", (e) => {
    if (e.target === modalLogHoursElem) closeAdminLogHoursModal();
  });
}

if (formAdminLogHours) {
  formAdminLogHours.addEventListener("submit", async () => {
    const empId = document.getElementById("admin-log-emp-id").value;
    const work_date = document.getElementById("admin-log-date").value;
    const hours_spent = parseFloat(document.getElementById("admin-log-hours-val").value);
    const description = document.getElementById("admin-log-desc").value.trim();

    if (!hours_spent || !description) return;

    try {
      const res = await fetch(`/api/employees/${empId}/hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: parseInt(empId), work_date, hours_spent, description })
      });
      if (!res.ok) throw new Error("Kunne ikke føre timer.");
      alert("✓ Timene er registrert!");
      closeAdminLogHoursModal();
      loadEmployees();
    } catch (e) {
      alert(e.message);
    }
  });
}

// Edit Employee Modal
function openEditEmployeeModal(emp) {
  const modal = document.getElementById("modal-edit-employee");
  if (!modal) return;
  document.getElementById("edit-emp-id").value = emp.id;
  document.getElementById("edit-emp-name").value = emp.full_name;
  document.getElementById("edit-emp-phone").value = emp.phone || "";
  document.getElementById("edit-emp-status").value = emp.status || "Aktiv";
  document.getElementById("edit-emp-pct").value = emp.employment_percentage || 100;
  document.getElementById("edit-emp-rate").value = emp.hourly_rate || 380;
  document.getElementById("edit-emp-specialty").value = emp.handyman_specialty || "";
  document.getElementById("edit-emp-bio").value = emp.bio || "";
  modal.style.display = "flex";
  modal.classList.add("active");
}

function openEditEmployeeModalById(empId) {
  const emp = allEmployees.find(e => e.id === empId);
  if (emp) openEditEmployeeModal(emp);
}

function openHandymanProfileView(empId) {
  selectedHandymanId = empId;
  const profileTab = document.getElementById("nav-item-my-profile");
  if (profileTab) {
    profileTab.click();
  }
  loadHandymanProfile(empId);
}

function closeEditEmployeeModal() {
  const modal = document.getElementById("modal-edit-employee");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}
if (btnCloseEditEmployee) btnCloseEditEmployee.addEventListener("click", closeEditEmployeeModal);
const modalEditEmployeeElem = document.getElementById("modal-edit-employee");
if (modalEditEmployeeElem) {
  modalEditEmployeeElem.addEventListener("click", (e) => {
    if (e.target === modalEditEmployeeElem) closeEditEmployeeModal();
  });
}

if (formEditEmployee) {
  formEditEmployee.addEventListener("submit", async () => {
    const empId = document.getElementById("edit-emp-id").value;
    const full_name = document.getElementById("edit-emp-name").value.trim();
    const phone = document.getElementById("edit-emp-phone").value.trim();
    const status = document.getElementById("edit-emp-status").value;
    const employment_percentage = parseInt(document.getElementById("edit-emp-pct").value);
    const hourly_rate = parseFloat(document.getElementById("edit-emp-rate").value) || 380;
    const handyman_specialty = document.getElementById("edit-emp-specialty").value.trim();
    const bio = document.getElementById("edit-emp-bio").value.trim();

    try {
      const res = await fetch(`/api/employees/${empId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name, phone, status, employment_percentage, hourly_rate, handyman_specialty, bio })
      });
      if (!res.ok) throw new Error("Kunne ikke lagre endringer.");
      alert("✓ Ansattprofilen er oppdatert!");
      closeEditEmployeeModal();
      loadEmployees();
    } catch (e) {
      alert(e.message);
    }
  });
}

// Global functions exposed to window for inline onclick attributes
window.switchCalMode = switchCalMode;
window.loadMonthCalendar = loadMonthCalendar;
window.loadCalendarDispatch = loadCalendarDispatch;
window.goToDayDispatch = goToDayDispatch;
window.openOrderDrawer = openOrderDrawer;
window.closeEditEmployeeModal = closeEditEmployeeModal;
window.openEditEmployeeModal = openEditEmployeeModal;
window.openEditEmployeeModalById = openEditEmployeeModalById;
window.openHandymanProfileView = openHandymanProfileView;
window.openAdminLogHoursModal = openAdminLogHoursModal;
window.closeAdminLogHoursModal = closeAdminLogHoursModal;


// ==========================================================================
// 14. ACCOUNTING, P&L, EXPENSES & EMPLOYMENT CONTRACTS CONTROLLER
// ==========================================================================

let activeContractDraft = null;
let currentAccountingData = null;

async function loadAccountingSummary() {
  const payrollTbody = document.getElementById("acc-payroll-tbody");
  const expTbody = document.getElementById("acc-expenses-tbody");
  if (!payrollTbody || !expTbody) return;

  payrollTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748B; padding: 1.5rem;">Laster inn lønnsavregning...</td></tr>`;
  expTbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #64748B; padding: 1.5rem;">Laster inn utgiftsbilag...</td></tr>`;

  try {
    const res = await fetch("/api/accounting/summary");
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente regnskapsdata.");

    currentAccountingData = data;
    const rev = data.revenue;
    const pay = data.payroll;
    const exp = data.expenses;
    const prof = data.profit;
    const vat = data.vat_settlement;

    // 1. KPI Cards
    const revNetElem = document.getElementById("acc-rev-net");
    const revGrossSub = document.getElementById("acc-rev-gross-sub");
    const payCostElem = document.getElementById("acc-payroll-cost");
    const payAgaSub = document.getElementById("acc-payroll-aga-sub");
    const payFiscalElem = document.getElementById("acc-payroll-fiscal-annual");
    const payFiscalSub = document.getElementById("acc-payroll-fiscal-sub");
    const expNetElem = document.getElementById("acc-exp-net");
    const expGrossSub = document.getElementById("acc-exp-gross-sub");
    const netProfitElem = document.getElementById("acc-net-profit");
    const profitMarginSub = document.getElementById("acc-profit-margin-sub");
    const vatPayableElem = document.getElementById("acc-vat-payable");
    const vatSub = document.getElementById("acc-vat-sub");

    if (revNetElem) revNetElem.textContent = formatNOK(rev.net);
    if (revGrossSub) revGrossSub.textContent = `Brutto: ${formatNOK(rev.gross)} (${rev.completed_count} fullførte)`;

    if (payCostElem) payCostElem.textContent = formatNOK(pay.total_payroll_cost);
    if (payAgaSub) payAgaSub.textContent = `Påløpt: Brutto ${formatNOK(pay.gross_wages)} + 14.1% AGA`;

    if (payFiscalElem && pay.fiscal_year) {
      payFiscalElem.textContent = formatNOK(pay.fiscal_year.total_annual_cost);
    }
    if (payFiscalSub && pay.fiscal_year) {
      payFiscalSub.textContent = `Helår: Brutto ${formatNOK(pay.fiscal_year.annual_gross_wages)} + AGA/OTP (${pay.fiscal_year.active_employees_count} ansatte)`;
    }

    if (expNetElem) expNetElem.textContent = formatNOK(exp.net);
    if (expGrossSub) expGrossSub.textContent = `Brutto: ${formatNOK(exp.gross)} (MVA: ${formatNOK(exp.vat_deductible)})`;

    if (netProfitElem) {
      netProfitElem.textContent = formatNOK(prof.net_profit);
      netProfitElem.style.color = prof.is_profitable ? "#059669" : "#DC2626";
    }
    if (profitMarginSub) {
      profitMarginSub.textContent = `Margin: ${prof.profit_margin_pct}% (${prof.is_profitable ? '🟢 Overskudd' : '🔴 Driftsunderskudd'})`;
      profitMarginSub.style.color = prof.is_profitable ? "#059669" : "#DC2626";
    }

    if (vatPayableElem) vatPayableElem.textContent = formatNOK(vat.net_vat_payable);
    if (vatSub) vatSub.textContent = `Utgående ${formatNOK(vat.sales_vat_outgoing)} - Inngående ${formatNOK(vat.purchase_vat_incoming)}`;

    // 2. Render Payroll Table
    const empBreakdown = pay.employees_breakdown || [];
    if (empBreakdown.length === 0) {
      payrollTbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #64748B; padding: 1.5rem;">Ingen ansatte funnet.</td></tr>`;
    } else {
      payrollTbody.innerHTML = empBreakdown.map(h => {
        const isVikar = h.employment_percentage === 0;
        const pctBadge = isVikar 
          ? `<span style="font-weight: 700; color: #7E22CE; background: #F3E8FF; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem;">0% Tilkalling</span>`
          : `<span style="font-weight: 700; color: #059669;">${h.employment_percentage}%</span>`;
        const normText = isVikar 
          ? `<span style="color: #64748B; font-size: 0.78rem;">Etter behov</span>`
          : `${h.target_weekly_hours}t/u <span style="font-size: 0.73rem; color: #64748B;">(${h.annual_hours_norm}t/år)</span>`;
        const annualFiscalCol = isVikar
          ? `<span style="color: #7E22CE; font-weight: 700; font-size: 0.82rem;">Timebasert / Tilkalling</span><span style="display: block; font-size: 0.72rem; color: #64748B;">(Avtalt: ${formatNOK(h.hourly_rate)}/t)</span>`
          : `<strong style="color: #B91C1C;">${formatNOK(h.fiscal_year_annual_total_cost)}</strong><span style="display: block; font-size: 0.72rem; color: #64748B;">(Brutto ${formatNOK(h.fiscal_year_annual_gross)})</span>`;

        return `
          <tr>
            <td><strong>${h.full_name}</strong></td>
            <td>${pctBadge}</td>
            <td>${normText}</td>
            <td><strong style="color: #0F172A;">${h.hours_worked}t</strong></td>
            <td>${formatNOK(h.hourly_rate)}/t</td>
            <td><strong>${formatNOK(h.gross_wage)}</strong></td>
            <td style="color: #64748B;">${formatNOK(h.aga_tax)}</td>
            <td><strong style="color: #DC2626;">${formatNOK(h.total_cost)}</strong></td>
            <td>${annualFiscalCol}</td>
            <td>
              <button class="btn-primary-sm btn-open-contract-modal" onclick="openContractViewer(${h.user_id})" style="background: #0F172A; color: white; border: none; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.3rem;">
                📄 Arbeidsavtale
              </button>
            </td>
          </tr>
        `;
      }).join("");
    }

    // 3. Render Expenses Table
    renderExpensesTable(exp.recent_list || []);

  } catch (err) {
    console.error("Feil ved lasting av regnskap:", err);
  }
}

function renderExpensesTable(expensesList) {
  const expTbody = document.getElementById("acc-expenses-tbody");
  if (!expTbody) return;

  const catFilter = document.getElementById("acc-exp-category-filter");
  const selectedCat = catFilter ? catFilter.value : "Alle";

  const filtered = selectedCat === "Alle" ? expensesList : expensesList.filter(x => x.category === selectedCat);

  if (filtered.length === 0) {
    expTbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #64748B; padding: 1.5rem;">Ingen utgifter funnet i denne kategorien.</td></tr>`;
    return;
  }

  expTbody.innerHTML = filtered.map(x => `
    <tr>
      <td><span style="font-family: monospace; font-size: 0.82rem; color: #64748B;">${x.expense_date}</span></td>
      <td><strong>${x.title}</strong></td>
      <td><span style="font-weight: 600; color: #0F172A;">${x.vendor}</span></td>
      <td><span style="font-size: 0.78rem; background: #F1F5F9; padding: 0.2rem 0.5rem; border-radius: 4px; color: #475569; font-weight: 600;">${x.category}</span></td>
      <td><strong style="color: #0F172A;">${formatNOK(x.amount_gross)}</strong></td>
      <td style="color: #64748B;">${x.vat_rate}%</td>
      <td>${formatNOK(x.amount_net)}</td>
      <td style="color: #059669; font-weight: 600;">${formatNOK(x.vat_amount)}</td>
      <td style="font-size: 0.8rem; color: #64748B;">${x.notes || '-'}</td>
      <td>
        <button type="button" class="btn-primary-sm btn-delete-expense" onclick="deleteExpense(${x.id})" title="Slett bilag" style="background: none; border: 1px solid #FECACA; color: #DC2626; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.78rem; cursor: pointer;">
          🗑️
        </button>
      </td>
    </tr>
  `).join("");
}

async function deleteExpense(expId) {
  if (!confirm("Er du sikker på at du vil slette dette utgiftsbilaget fra regnskapet?")) return;
  try {
    const res = await fetch(`/api/expenses/${expId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Kunne ikke slette bilag.");
    alert("✓ Utgiften er slettet fra regnskapet.");
    loadAccountingSummary();
  } catch(e) {
    alert("Feil ved sletting: " + e.message);
  }
}

function exportAccountingCSV() {
  if (!currentAccountingData) {
    alert("Regnskapsdata laster... Vennligst prøv igjen om et øyeblikk.");
    return;
  }
  const exp = currentAccountingData.expenses ? currentAccountingData.expenses.recent_list || [] : [];
  const pay = currentAccountingData.payroll ? currentAccountingData.payroll.employees_breakdown || [] : [];
  const rev = currentAccountingData.revenue || {};
  const prof = currentAccountingData.profit || {};

  let csv = "SERVIDA AS - RESULTATREGNSKAP & BILAGSEKSPORT\n";
  csv += `Eksportert dato;${new Date().toLocaleDateString('no-NO')} ${new Date().toLocaleTimeString('no-NO')}\n`;
  csv += `Netto omsetning;${rev.net || 0} NOK\n`;
  csv += `Påløpt lønnskostnad (YTD);${currentAccountingData.payroll ? currentAccountingData.payroll.total_payroll_cost : 0} NOK\n`;
  csv += `Driftsutgifter;${currentAccountingData.expenses ? currentAccountingData.expenses.net : 0} NOK\n`;
  csv += `Netto driftsresultat;${prof.net_profit || 0} NOK (Margin: ${prof.profit_margin_pct || 0}%)\n\n`;

  csv += "--- UTGIFTER OG BILAG ---\n";
  csv += "Dato;Tittel;Leverandør;Kategori;Brutto (NOK);MVA-sats;Netto (NOK);MVA-beløp (NOK);Notat\n";
  exp.forEach(x => {
    csv += `"${x.expense_date}";"${x.title}";"${x.vendor}";"${x.category}";${x.amount_gross};${x.vat_rate}%;${x.amount_net};${x.vat_amount};"${x.notes || ''}"\n`;
  });

  csv += "\n--- LØNNSAVREGNING & FISCAL ÅRSTOTALER ---\n";
  csv += "Håndverker;Stillingsprosent;Normtid uke;Loggede timer;Timesats;Påløpt Bruttolønn;AGA (14.1%);Total lønnskostnad YTD;Fiscal Helårskostnad\n";
  pay.forEach(p => {
    csv += `"${p.full_name}";"${p.employment_percentage}%";${p.target_weekly_hours}t;${p.hours_worked}t;${p.hourly_rate} kr/t;${p.gross_wage} kr;${p.aga_tax} kr;${p.total_cost} kr;${p.fiscal_year_annual_total_cost} kr\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Servida_Regnskap_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Filter listener for expenses category
const accExpCatFilter = document.getElementById("acc-exp-category-filter");
if (accExpCatFilter) {
  accExpCatFilter.addEventListener("change", () => {
    if (currentAccountingData && currentAccountingData.expenses) {
      renderExpensesTable(currentAccountingData.expenses.recent_list || []);
    }
  });
}

// --- CREATE EXPENSE MODAL CONTROLLER ---
const modalCreateExpense = document.getElementById("modal-create-expense");
const btnOpenCreateExpense = document.getElementById("btn-open-create-expense");
const btnCloseCreateExpense = document.getElementById("btn-close-create-expense");
const formCreateExpense = document.getElementById("form-create-expense");

function openCreateExpenseModal() {
  const modal = document.getElementById("modal-create-expense");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("active");
    document.getElementById("new-exp-title").value = "";
    document.getElementById("new-exp-vendor").value = "";
    document.getElementById("new-exp-amount").value = "";
    document.getElementById("new-exp-notes").value = "";
    document.getElementById("new-exp-date").value = new Date().toISOString().split('T')[0];
    setTimeout(() => document.getElementById("new-exp-title").focus(), 150);
  }
}

if (btnOpenCreateExpense) {
  btnOpenCreateExpense.addEventListener("click", openCreateExpenseModal);
}

function closeCreateExpenseModal() {
  const modal = document.getElementById("modal-create-expense");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}
if (btnCloseCreateExpense) btnCloseCreateExpense.addEventListener("click", closeCreateExpenseModal);
const modalCreateExpenseElem = document.getElementById("modal-create-expense");
if (modalCreateExpenseElem) {
  modalCreateExpenseElem.addEventListener("click", (e) => {
    if (e.target === modalCreateExpenseElem) closeCreateExpenseModal();
  });
}

if (formCreateExpense) {
  formCreateExpense.addEventListener("submit", async () => {
    const title = document.getElementById("new-exp-title").value.trim();
    const vendor = document.getElementById("new-exp-vendor").value.trim();
    const category = document.getElementById("new-exp-category").value;
    const amount_gross = parseFloat(document.getElementById("new-exp-amount").value);
    const vat_rate = parseFloat(document.getElementById("new-exp-vat").value);
    const expense_date = document.getElementById("new-exp-date").value;
    const notes = document.getElementById("new-exp-notes").value.trim();

    if (!title || !vendor || !amount_gross) {
      alert("Vennligst fyll ut tittel, leverandør og beløp.");
      return;
    }

    const btnSub = document.getElementById("btn-save-create-expense");
    btnSub.disabled = true;
    btnSub.textContent = "Lagrer...";

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, vendor, category, amount_gross, vat_rate, expense_date, notes,
          created_by: currentStaffUser ? currentStaffUser.full_name : "Admin"
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke lagre utgift.");

      alert(`✓ ${data.message}`);
      closeCreateExpenseModal();
      loadAccountingSummary();
    } catch (err) {
      alert(err.message);
    } finally {
      btnSub.disabled = false;
      btnSub.textContent = "💾 Lagre utgift i regnskapet";
    }
  });
}


// --- EMPLOYMENT CONTRACT VIEWER & GENERATOR ---
const modalContractViewer = document.getElementById("modal-contract-viewer");
const btnCloseContractViewer = document.getElementById("btn-close-contract-viewer");
const btnPrintContract = document.getElementById("btn-print-contract");
const btnSaveContractDb = document.getElementById("btn-save-contract-db");

async function openContractViewer(userId) {
  const modal = document.getElementById("modal-contract-viewer");
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("active");

  try {
    const res = await fetch(`/api/contracts/user/${userId}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente arbeidsavtale.");

    const ctr = data.contract;
    activeContractDraft = ctr;

    document.getElementById("ctr-number-badge").textContent = ctr.contract_number;
    const badgeStatus = document.getElementById("ctr-status-badge");
    if (badgeStatus) {
      badgeStatus.textContent = data.is_saved ? "✓ Signert & Aktiv" : "📝 Forhåndsutfylt Utkast";
      badgeStatus.style.color = data.is_saved ? "#059669" : "#D97706";
    }

    document.getElementById("ctr-emp-name").textContent = ctr.employee_name;
    document.getElementById("ctr-emp-email").textContent = ctr.employee_email || '-';
    document.getElementById("ctr-emp-phone").textContent = ctr.employee_phone || '-';
    document.getElementById("ctr-emp-address").textContent = ctr.employee_address || 'Bergen';

    document.getElementById("ctr-position").textContent = ctr.position_title;
    document.getElementById("ctr-start-date").textContent = ctr.start_date;
    document.getElementById("ctr-probation").textContent = ctr.probation_period;

    document.getElementById("ctr-pct").textContent = `${ctr.employment_percentage} %`;
    document.getElementById("ctr-weekly-hours").textContent = `${ctr.weekly_hours} timer`;
    document.getElementById("ctr-workplace").textContent = ctr.workplace_address;

    document.getElementById("ctr-hourly-rate").textContent = formatNOK(ctr.hourly_rate);
    document.getElementById("ctr-notice").textContent = ctr.notice_period;
    document.getElementById("ctr-special-terms").textContent = ctr.special_terms || 'Fast ansettelse med firmabil og verktøygodtgjørelse. Arbeidstaker forplikter seg til å følge Servida AS sine HMS-rutiner.';
    document.getElementById("ctr-sig-name").textContent = ctr.employee_name;

    if (btnSaveContractDb) {
      btnSaveContractDb.textContent = data.is_saved ? "✓ Kontrakt er aktivert" : "💾 Lagre & Aktiver i Regnskap";
      btnSaveContractDb.disabled = data.is_saved;
    }

  } catch(err) {
    alert("Feil ved åpning av arbeidsavtale: " + err.message);
  }
}

function closeContractViewer() {
  const modal = document.getElementById("modal-contract-viewer");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
}
if (btnCloseContractViewer) btnCloseContractViewer.addEventListener("click", closeContractViewer);
const modalContractViewerElem = document.getElementById("modal-contract-viewer");
if (modalContractViewerElem) {
  modalContractViewerElem.addEventListener("click", (e) => {
    if (e.target === modalContractViewerElem) closeContractViewer();
  });
}

// Print contract handler
if (btnPrintContract) {
  btnPrintContract.addEventListener("click", () => {
    window.print();
  });
}

// Save Contract handler
if (btnSaveContractDb) {
  btnSaveContractDb.addEventListener("click", async () => {
    if (!activeContractDraft) return;

    btnSaveContractDb.disabled = true;
    btnSaveContractDb.textContent = "Lagrer...";

    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: activeContractDraft.user_id,
          employee_name: activeContractDraft.employee_name,
          position_title: activeContractDraft.position_title,
          employment_percentage: activeContractDraft.employment_percentage,
          weekly_hours: activeContractDraft.weekly_hours,
          hourly_rate: activeContractDraft.hourly_rate,
          start_date: activeContractDraft.start_date,
          probation_period: activeContractDraft.probation_period,
          notice_period: activeContractDraft.notice_period,
          workplace_address: activeContractDraft.workplace_address,
          special_terms: activeContractDraft.special_terms
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke lagre kontrakt.");

      alert(`✓ ${data.message}`);
      btnSaveContractDb.textContent = "✓ Kontrakt er aktivert";
      loadAccountingSummary();
      loadEmployees();
    } catch(err) {
      alert(err.message);
      btnSaveContractDb.disabled = false;
      btnSaveContractDb.textContent = "💾 Lagre & Aktiver i Regnskap";
    }
  });
}

// Export Accounting to CSV for accountant (Tripletex / Fiken / PowerOffice)
const btnExportSafT = document.getElementById("btn-export-saf-t");
if (btnExportSafT) {
  btnExportSafT.addEventListener("click", () => {
    if (!currentAccountingData) {
      alert("Ingen regnskapsdata å eksportere.");
      return;
    }

    const exp = currentAccountingData.expenses.recent_list || [];
    const pay = currentAccountingData.payroll.employees_breakdown || [];
    
    let csv = "SERVIDA AS - REGNSKAPSEKSPORT (P&L, LONN & UTGIFTER)\n";
    csv += `Dato: ${new Date().toISOString().split('T')[0]}\n\n`;
    csv += "--- RESULTATREGNSKAP ---\n";
    csv += `Netto Omsetning;${currentAccountingData.revenue.net};NOK\n`;
    csv += `Lonnskostnader Paalopt (YTD);${currentAccountingData.payroll.total_payroll_cost};NOK\n`;
    if (currentAccountingData.payroll.fiscal_year) {
      csv += `Total Lonnskostnad Fiscal Aar (${currentAccountingData.payroll.fiscal_year.year} Helaar);${currentAccountingData.payroll.fiscal_year.total_annual_cost};NOK\n`;
    }
    csv += `Driftsutgifter netto;${currentAccountingData.expenses.net};NOK\n`;
    csv += `Netto Driftsresultat;${currentAccountingData.profit.net_profit};NOK\n`;
    csv += `Skyldig MVA;${currentAccountingData.vat_settlement.net_vat_payable};NOK\n\n`;

    csv += "--- LONNSAVREGNING & FISCAL AARSTOTALER ---\n";
    csv += "Ansatt;Stilling;Timer (YTD);Normtid Aar;Timesats;Paalopt Bruttolonn;Paalopt AGA;Paalopt Totalkostnad;Fiscal Aar Helarstotal\n";
    pay.forEach(p => {
      csv += `"${p.full_name}";"${p.employment_percentage}%";${p.hours_worked};${p.annual_hours_norm};${p.hourly_rate};${p.gross_wage};${p.aga_tax};${p.total_cost};${p.fiscal_year_annual_total_cost}\n`;
    });
    csv += "\n--- UTGIFTER & BILAG ---\n";
    csv += "Dato;Tittel;Leverandor;Kategori;Brutto;MVA-sats;Netto;MVA-belop;Notat\n";
    exp.forEach(e => {
      csv += `"${e.expense_date}";"${e.title}";"${e.vendor}";"${e.category}";${e.amount_gross};${e.vat_rate}%;${e.amount_net};${e.vat_amount};"${e.notes || ''}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Servida_Regnskapseksport_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}


// ==========================================================================
// 15. EMAIL SERVICE & COMMUNICATION HUB CONTROLLER
// ==========================================================================

let activeEmailFolder = "inbox";
let activeEmailCategory = "Alle";
let currentSelectedEmailId = null;
let emailTemplatesCache = [];

async function loadEmails(folder = activeEmailFolder, category = activeEmailCategory, search = "") {
  activeEmailFolder = folder;
  activeEmailCategory = category;

  const listContainer = document.getElementById("email-list-container");
  if (!listContainer) return;
  listContainer.innerHTML = `<div style="text-align: center; color: #64748B; padding: 2rem;">Laster inn e-poster...</div>`;

  try {
    const params = new URLSearchParams();
    if (folder) params.append("folder", folder);
    if (category && category !== "Alle") params.append("category", category);
    if (search) params.append("search", search);

    const res = await fetch(`/api/emails?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente e-poster");

    // Update Counts & Badges
    const inboxCountElem = document.getElementById("email-inbox-count");
    const sentCountElem = document.getElementById("email-sent-count");
    const autoCountElem = document.getElementById("email-auto-count");
    const navBadgeElem = document.getElementById("badge-unread-emails");

    if (inboxCountElem) inboxCountElem.textContent = data.unread_inbox_count || "0";
    if (sentCountElem) sentCountElem.textContent = data.total_sent || "0";
    if (autoCountElem) autoCountElem.textContent = data.total_automated || "0";
    if (navBadgeElem) {
      navBadgeElem.textContent = data.unread_inbox_count || "0";
      navBadgeElem.style.display = data.unread_inbox_count > 0 ? "inline-block" : "none";
    }

    renderEmailList(data.emails || []);

    // Auto-select first email if none selected
    if (data.emails && data.emails.length > 0 && !currentSelectedEmailId) {
      openEmailDetail(data.emails[0].id);
    } else if (!data.emails || data.emails.length === 0) {
      renderEmptyEmailViewer();
    }
  } catch (err) {
    console.error("Feil ved lasting av e-poster:", err);
  }
}

function renderEmailList(emails) {
  const container = document.getElementById("email-list-container");
  if (!container) return;

  if (emails.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: #64748B; background: #F8FAFC; border-radius: 8px; border: 1px dashed var(--admin-border);">
        <span style="font-size: 2rem; display: block; margin-bottom: 0.5rem;">📭</span>
        <strong style="display: block; color: #0F172A;">Ingen e-poster funnet</strong>
        <span style="font-size: 0.8rem;">Mappen er tom eller ingen e-poster matcher søket.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = emails.map(em => {
    const isSelected = em.id === currentSelectedEmailId;
    const isUnread = em.is_read === 0;
    const dateStr = em.created_at ? em.created_at.split(' ')[0] : '';
    const catColor = getEmailCategoryColor(em.category);

    return `
      <div class="email-item-card" onclick="openEmailDetail(${em.id})" style="padding: 0.85rem; border-radius: 10px; border: 1px solid ${isSelected ? '#3B82F6' : (isUnread ? '#CBD5E1' : '#E2E8F0')}; background: ${isSelected ? '#EFF6FF' : (isUnread ? '#FFFFFF' : '#F8FAFC')}; cursor: pointer; transition: all 0.15s ease; box-shadow: ${isUnread ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            ${isUnread ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: #2563EB; display: inline-block;"></span>' : ''}
            <strong style="font-size: 0.88rem; color: ${isUnread ? '#0F172A' : '#475569'};">
              ${activeEmailFolder === 'sent' ? `Til: ${em.recipient_name}` : em.sender_name}
            </strong>
          </div>
          <span style="font-size: 0.72rem; color: #94A3B8;">${dateStr}</span>
        </div>

        <div style="font-size: 0.84rem; font-weight: ${isUnread ? '700' : '600'}; color: #0F172A; margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${em.subject}
        </div>

        <div style="font-size: 0.78rem; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.45rem;">
          ${em.body_text || em.subject}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.68rem; font-weight: 700; background: ${catColor.bg}; color: ${catColor.text}; padding: 0.15rem 0.45rem; border-radius: 4px;">
            ${em.category}
          </span>
          <span style="font-size: 0.72rem; color: #64748B;">
            ${em.status === 'Levert' ? '✓ Levert' : em.status}
          </span>
        </div>
      </div>
    `;
  }).join("");
}

function getEmailCategoryColor(category) {
  switch (category) {
    case "Ordrebekreftelse": return { bg: "#DCFCE7", text: "#166534" };
    case "Oppdrag": return { bg: "#EFF6FF", text: "#1E40AF" };
    case "Tilbud": return { bg: "#FEF3C7", text: "#92400E" };
    case "Faktura": return { bg: "#FEE2E2", text: "#991B1B" };
    case "Kundehenvendelse": return { bg: "#F3E8FF", text: "#6B21A8" };
    case "System": return { bg: "#F1F5F9", text: "#475569" };
    default: return { bg: "#F1F5F9", text: "#475569" };
  }
}

async function openEmailDetail(emailId) {
  currentSelectedEmailId = emailId;
  const viewer = document.getElementById("email-viewer-container");
  if (!viewer) return;

  viewer.innerHTML = `<div style="text-align: center; color: #64748B; padding: 3rem;">Laster inn e-post...</div>`;

  try {
    const res = await fetch(`/api/emails/${emailId}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente e-post");

    const em = data.email;
    const relOrder = data.related_order;
    const catColor = getEmailCategoryColor(em.category);

    viewer.innerHTML = `
      <!-- Email Header -->
      <div style="border-bottom: 1px solid var(--admin-border); padding-bottom: 1.25rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem;">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: #0F172A; margin: 0; line-height: 1.3;">
            ${em.subject}
          </h3>
          <span style="font-size: 0.75rem; font-weight: 700; background: ${catColor.bg}; color: ${catColor.text}; padding: 0.2rem 0.6rem; border-radius: 6px; white-space: nowrap;">
            ${em.category}
          </span>
        </div>

        <!-- Sender/Recipient Metadata -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; font-size: 0.85rem;">
          <div>
            <div style="margin-bottom: 0.15rem;">
              <span style="color: #64748B;">Fra:</span> <strong>${em.sender_name}</strong> &lt;${em.sender_email}&gt;
            </div>
            <div>
              <span style="color: #64748B;">Til:</span> <strong>${em.recipient_name}</strong> &lt;${em.recipient_email}&gt;
            </div>
          </div>
          <div style="text-align: right; color: #64748B; font-size: 0.78rem;">
            <div>📅 ${em.created_at}</div>
            <div style="color: #059669; font-weight: 600; margin-top: 0.15rem;">Status: ${em.status}</div>
          </div>
        </div>
      </div>

      <!-- Action Toolbar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; background: white; border: 1px solid var(--admin-border); border-radius: 8px; padding: 0.5rem 0.75rem;">
        <div style="display: flex; gap: 0.4rem;">
          <button onclick="replyToCurrentEmail('${em.sender_email}', '${em.sender_name}', '${em.subject.replace(/'/g, "\\'")}', ${em.related_order_id || 'null'})" style="background: #0F172A; color: white; border: none; padding: 0.4rem 0.85rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.3rem;">
            ↩️ Svar
          </button>
          <button onclick="forwardCurrentEmail('${em.subject.replace(/'/g, "\\'")}', \`${(em.body_text || '').replace(/`/g, '\\`')}\`)" style="background: #F1F5F9; color: #0F172A; border: 1px solid var(--admin-border); padding: 0.4rem 0.75rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;">
            ➡️ Videresend
          </button>
        </div>

        <div style="display: flex; gap: 0.4rem; align-items: center;">
          ${relOrder ? `
            <button onclick="openOrderDrawer(${relOrder.id})" style="background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; padding: 0.4rem 0.75rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.3rem;">
              📋 Åpne Ordre #${relOrder.order_number}
            </button>
          ` : ''}
          <button onclick="deleteEmailItem(${em.id})" style="background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; padding: 0.4rem 0.65rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;" title="Slett e-post">
            🗑️ Slett
          </button>
        </div>
      </div>

      <!-- Email Body Container -->
      <div style="background: white; border-1px: solid var(--admin-border); border-radius: 10px; padding: 1.5rem; flex: 1; overflow-y: auto; line-height: 1.6; font-size: 0.92rem; color: #1E293B;">
        ${em.body_html || (em.body_text ? em.body_text.replace(/\n/g, '<br>') : '')}
      </div>
    `;

    // Visually update the active card border in list
    document.querySelectorAll(".email-item-card").forEach(card => {
      card.style.background = "#F8FAFC";
      card.style.borderColor = "#E2E8F0";
    });
  } catch (err) {
    viewer.innerHTML = `<div style="color: #DC2626; padding: 2rem;">Feil: ${err.message}</div>`;
  }
}

function renderEmptyEmailViewer() {
  const viewer = document.getElementById("email-viewer-container");
  if (!viewer) return;
  viewer.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 350px; text-align: center; color: #64748B;">
      <span style="font-size: 3rem; display: block; margin-bottom: 0.75rem;">✉️</span>
      <h4 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0 0 0.25rem;">Ingen e-post valgt</h4>
      <p style="font-size: 0.88rem; max-width: 320px; margin: 0 0 1.25rem;">
        Velg en melding fra listen til venstre, eller skriv en ny e-post med Gemini AI.
      </p>
      <button onclick="openComposeEmailModal()" style="background: #0F172A; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer;">
        ➕ Skriv ny e-post
      </button>
    </div>
  `;
}

// Open Compose Modal
function openComposeEmailModal(recipientEmail = "", recipientName = "", subject = "", body = "", orderId = null, category = "Generell") {
  const modal = document.getElementById("modal-compose-email");
  if (!modal) return;

  document.getElementById("compose-recipient-email").value = recipientEmail;
  document.getElementById("compose-recipient-name").value = recipientName;
  document.getElementById("compose-subject").value = subject;
  document.getElementById("compose-body").value = body;
  document.getElementById("compose-order-id").value = orderId || "";
  document.getElementById("compose-category").value = category;

  modal.style.display = "flex";
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function closeComposeEmailModal() {
  const modal = document.getElementById("modal-compose-email");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
}

// Reply Helper
function replyToCurrentEmail(senderEmail, senderName, subject, orderId) {
  const replySubject = subject.startsWith("Sv: ") ? subject : `Sv: ${subject}`;
  openComposeEmailModal(senderEmail, senderName, replySubject, `\n\n--- Opprinnelig melding fra ${senderName} ---\n`, orderId, "Kundehenvendelse");
}

// Forward Helper
function forwardCurrentEmail(subject, bodyText) {
  const fwdSubject = subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`;
  openComposeEmailModal("", "", fwdSubject, `\n\n--- Videresendt melding ---\n${bodyText}`, null, "Generell");
}

// Delete Email Helper
async function deleteEmailItem(emailId) {
  if (!confirm("Er du sikker på at du vil slette/flytte denne e-posten?")) return;
  try {
    const res = await fetch(`/api/emails/${emailId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Kunne ikke slette e-post.");
    currentSelectedEmailId = null;
    loadEmails(activeEmailFolder, activeEmailCategory);
  } catch (err) {
    alert(err.message);
  }
}

// Quick Template Selector in Compose Modal
const composeTemplateSelect = document.getElementById("compose-template-select");
if (composeTemplateSelect) {
  composeTemplateSelect.addEventListener("change", async (e) => {
    const key = e.target.value;
    if (!key) return;

    if (emailTemplatesCache.length === 0) {
      try {
        const res = await fetch("/api/email-templates");
        const data = await res.json();
        emailTemplatesCache = data.templates || [];
      } catch (err) {}
    }

    const tpl = emailTemplatesCache.find(t => t.template_key === key);
    if (tpl) {
      const recipientName = document.getElementById("compose-recipient-name").value || "Kunde";
      let bodyText = tpl.body_template.replace(/{customer_name}/g, recipientName).replace(/{order_number}/g, "SRV-1001").replace(/{service_title}/g, "Montering").replace(/{variant_name}/g, "Standard").replace(/{total_price}/g, "1890").replace(/{preferred_date}/g, "2026-08-15").replace(/{time_slot}/g, "09:00 - 12:00").replace(/{street_address}/g, "Fjellveien 14").replace(/{postal_code}/g, "5014").replace(/{city}/g, "Bergen");
      let subj = tpl.subject_template.replace(/{order_number}/g, "SRV-1001").replace(/{customer_name}/g, recipientName);

      document.getElementById("compose-subject").value = subj;
      document.getElementById("compose-body").value = bodyText;
    }
  });
}

// AI Email Generation Button
const btnGenerateEmailAi = document.getElementById("btn-generate-email-ai");
if (btnGenerateEmailAi) {
  btnGenerateEmailAi.addEventListener("click", async () => {
    const prompt = document.getElementById("compose-ai-prompt").value.trim();
    if (!prompt) {
      alert("Vennligst skriv en kort instruks om hva e-posten skal inneholde.");
      return;
    }

    const recipientName = document.getElementById("compose-recipient-name").value.trim() || "Kunde";
    const category = document.getElementById("compose-category").value;
    const orderId = parseInt(document.getElementById("compose-order-id").value) || null;

    btnGenerateEmailAi.disabled = true;
    btnGenerateEmailAi.textContent = "✨ Skriver e-post...";

    try {
      const res = await fetch("/api/emails/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, recipient_name: recipientName, category, order_id: orderId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke generere utkast.");

      if (data.subject) document.getElementById("compose-subject").value = data.subject;
      if (data.body_text) document.getElementById("compose-body").value = data.body_text;
    } catch (err) {
      alert("AI Feil: " + err.message);
    } finally {
      btnGenerateEmailAi.disabled = false;
      btnGenerateEmailAi.textContent = "✨ Generer";
    }
  });
}

// Send Email Form Submission
const formComposeEmail = document.getElementById("form-compose-email");
if (formComposeEmail) {
  formComposeEmail.addEventListener("submit", async () => {
    const recipient_email = document.getElementById("compose-recipient-email").value.trim();
    const recipient_name = document.getElementById("compose-recipient-name").value.trim();
    const subject = document.getElementById("compose-subject").value.trim();
    const body_html = document.getElementById("compose-body").value.trim();
    const category = document.getElementById("compose-category").value;
    const related_order_id = parseInt(document.getElementById("compose-order-id").value) || null;

    if (!recipient_email || !subject || !body_html) {
      alert("Vennligst fyll ut alle påkrevde felt.");
      return;
    }

    const btn = document.getElementById("btn-submit-send-email");
    btn.disabled = true;
    btn.textContent = "Sender...";

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_email,
          recipient_name,
          subject,
          body_html,
          body_text: body_html,
          category,
          related_order_id,
          folder: "sent"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke sende e-post.");

      alert(`✓ ${data.message}`);
      closeComposeEmailModal();
      loadEmails("sent");
    } catch (err) {
      alert("Feil ved sending: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "✉️ Send E-post nå";
    }
  });
}

// Email Settings Modal Event Listeners
const btnOpenEmailSettings = document.getElementById("btn-open-email-settings");
const btnCloseEmailSettings = document.getElementById("btn-close-email-settings");
const formEmailSettings = document.getElementById("form-email-settings");

if (btnOpenEmailSettings) {
  btnOpenEmailSettings.addEventListener("click", async () => {
    const modal = document.getElementById("modal-email-settings");
    if (!modal) return;

    try {
      const res = await fetch("/api/email-settings");
      const data = await res.json();
      const s = data.settings || {};

      if (document.getElementById("es-host")) document.getElementById("es-host").value = s.smtp_host || "smtp.servida.no";
      if (document.getElementById("es-port")) document.getElementById("es-port").value = s.smtp_port || 587;
      if (document.getElementById("es-sender-name")) document.getElementById("es-sender-name").value = s.sender_name || "Servida AS Kundesenter";
      if (document.getElementById("es-sender-email")) document.getElementById("es-sender-email").value = s.sender_email || "post@servida.no";
      if (document.getElementById("es-auto-confirm")) document.getElementById("es-auto-confirm").checked = s.auto_order_confirmations === 1;
      if (document.getElementById("es-auto-dispatch")) document.getElementById("es-auto-dispatch").checked = s.auto_handyman_dispatch === 1;
      if (document.getElementById("es-auto-receipt")) document.getElementById("es-auto-receipt").checked = s.auto_completion_receipt === 1;
    } catch (err) {}

    modal.style.display = "flex";
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  });
}

if (btnCloseEmailSettings) {
  btnCloseEmailSettings.addEventListener("click", () => {
    const modal = document.getElementById("modal-email-settings");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("active");
      modal.setAttribute("aria-hidden", "true");
    }
  });
}

if (formEmailSettings) {
  formEmailSettings.addEventListener("submit", async () => {
    const smtp_host = document.getElementById("es-host").value.trim();
    const smtp_port = parseInt(document.getElementById("es-port").value) || 587;
    const sender_name = document.getElementById("es-sender-name").value.trim();
    const sender_email = document.getElementById("es-sender-email").value.trim();
    const auto_order_confirmations = document.getElementById("es-auto-confirm").checked ? 1 : 0;
    const auto_handyman_dispatch = document.getElementById("es-auto-dispatch").checked ? 1 : 0;
    const auto_completion_receipt = document.getElementById("es-auto-receipt").checked ? 1 : 0;

    try {
      const res = await fetch("/api/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp_host,
          smtp_port,
          sender_name,
          sender_email,
          auto_order_confirmations,
          auto_handyman_dispatch,
          auto_completion_receipt
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Kunne ikke lagre innstillinger.");

      alert("✓ E-postinnstillinger er lagret!");
      const modal = document.getElementById("modal-email-settings");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    } catch (err) {
      alert(err.message);
    }
  });
}

// Folder & Category Switch Functions
function switchEmailFolder(folder) {
  activeEmailFolder = folder;
  document.querySelectorAll(".email-folder-btn").forEach(b => {
    if (b.dataset.folder === folder) {
      b.classList.add("active");
      b.style.background = "#F1F5F9";
      b.style.color = "#0F172A";
      b.style.fontWeight = "700";
    } else {
      b.classList.remove("active");
      b.style.background = "transparent";
      b.style.color = "#475569";
      b.style.fontWeight = "600";
    }
  });
  loadEmails(folder, activeEmailCategory);
}

function filterEmailCategory(cat) {
  activeEmailCategory = cat;
  document.querySelectorAll(".email-cat-btn").forEach(b => {
    if (b.dataset.cat === cat) {
      b.classList.add("active");
      b.style.background = "#F8FAFC";
      b.style.color = "#0F172A";
      b.style.fontWeight = "700";
    } else {
      b.classList.remove("active");
      b.style.background = "transparent";
      b.style.color = "#475569";
      b.style.fontWeight = "600";
    }
  });
  loadEmails(activeEmailFolder, cat);
}

// Folder & Category Button Listeners
document.querySelectorAll(".email-folder-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    switchEmailFolder(btn.dataset.folder);
  });
});

document.querySelectorAll(".email-cat-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    filterEmailCategory(btn.dataset.cat);
  });
});

const emailSearchInput = document.getElementById("email-search-input");
if (emailSearchInput) {
  let searchTimer = null;
  emailSearchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadEmails(activeEmailFolder, activeEmailCategory, e.target.value.trim());
    }, 300);
  });
}

const btnOpenComposeEmail = document.getElementById("btn-open-compose-email");
if (btnOpenComposeEmail) {
  btnOpenComposeEmail.addEventListener("click", () => {
    openComposeEmailModal();
  });
}

const btnCloseComposeModal = document.getElementById("btn-close-compose-modal");
const btnCancelCompose = document.getElementById("btn-cancel-compose");
if (btnCloseComposeModal) btnCloseComposeModal.addEventListener("click", closeComposeEmailModal);
if (btnCancelCompose) btnCancelCompose.addEventListener("click", closeComposeEmailModal);
const btnRefreshEmails = document.getElementById("btn-refresh-emails");
if (btnRefreshEmails) btnRefreshEmails.addEventListener("click", () => loadEmails());

// ==========================================================================
// 16. INVOICE SYSTEM & PAYMENT TRACKING CONTROLLER
// ==========================================================================

let allInvoicesCache = [];
let activeInvoiceFilter = "Alle";
let activeInvoiceDetail = null;

async function loadInvoices(status = activeInvoiceFilter, search = "") {
  activeInvoiceFilter = status;
  const tbody = document.getElementById("invoices-table-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748B; padding: 2rem;">Laster inn fakturaer...</td></tr>`;

  try {
    const params = new URLSearchParams();
    if (status && status !== "Alle") params.append("status", status);
    if (search) params.append("search", search);

    const res = await fetch(`/api/invoices?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente fakturaer.");

    allInvoicesCache = data.invoices || [];
    const stats = data.stats || {};

    // Update KPI Cards
    const unpaidSumElem = document.getElementById("inv-kpi-unpaid-sum");
    const unpaidCountElem = document.getElementById("inv-kpi-unpaid-count");
    const paidSumElem = document.getElementById("inv-kpi-paid-sum");
    const paidCountElem = document.getElementById("inv-kpi-paid-count");
    const overdueSumElem = document.getElementById("inv-kpi-overdue-sum");
    const overdueCountElem = document.getElementById("inv-kpi-overdue-count");
    const badgeUnpaid = document.getElementById("badge-unpaid-invoices");

    if (unpaidSumElem) unpaidSumElem.textContent = formatNOK(stats.total_unpaid || 0);
    if (unpaidCountElem) unpaidCountElem.textContent = `${stats.unpaid_count || 0} fakturaer venter på betaling`;
    if (paidSumElem) paidSumElem.textContent = formatNOK(stats.total_paid || 0);
    if (paidCountElem) paidCountElem.textContent = `${stats.paid_count || 0} innbetalte fakturaer`;
    if (overdueSumElem) overdueSumElem.textContent = formatNOK(stats.total_overdue || 0);
    if (overdueCountElem) overdueCountElem.textContent = `${stats.overdue_count || 0} forfalte (Purring klargjort)`;
    if (badgeUnpaid) {
      badgeUnpaid.textContent = stats.unpaid_count || 0;
      badgeUnpaid.style.display = (stats.unpaid_count > 0) ? "inline-block" : "none";
    }

    renderInvoicesTable(allInvoicesCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #DC2626; padding: 2rem;">Feil ved lasting: ${err.message}</td></tr>`;
  }
}

function renderInvoicesTable(invoices) {
  const tbody = document.getElementById("invoices-table-tbody");
  if (!tbody) return;

  if (invoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748B; padding: 2rem;">Ingen fakturaer funnet i denne visningen.</td></tr>`;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    let statusBadge = "";
    if (inv.status === "Betalt") {
      statusBadge = `<span style="background: #DCFCE7; color: #166534; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.78rem;">✓ Betalt</span>`;
    } else if (inv.status === "Forfalt") {
      statusBadge = `<span style="background: #FEE2E2; color: #991B1B; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.78rem;">🔴 Forfalt</span>`;
    } else if (inv.status === "Purring sendt") {
      statusBadge = `<span style="background: #FEF3C7; color: #92400E; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.78rem;">⚠️ Purret</span>`;
    } else {
      statusBadge = `<span style="background: #F1F5F9; color: #0F172A; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.78rem;">⏳ Utestående</span>`;
    }

    return `
      <tr>
        <td><strong style="font-family: monospace; color: #0F172A; font-size: 0.9rem;">${inv.invoice_number}</strong></td>
        <td>
          <strong style="color: #0F172A; display: block;">${inv.customer_name}</strong>
          <span style="font-size: 0.75rem; color: #64748B;">${inv.customer_email}</span>
        </td>
        <td><span style="color: #475569; font-size: 0.82rem;">${inv.invoice_date}</span></td>
        <td><span style="color: ${inv.status === 'Forfalt' ? '#DC2626' : '#475569'}; font-weight: 700; font-size: 0.82rem;">${inv.due_date}</span></td>
        <td><strong style="color: #0F172A; font-size: 0.95rem;">${formatNOK(inv.total_gross)}</strong></td>
        <td><span style="font-size: 0.8rem; color: #64748B;">Netto: ${formatNOK(inv.subtotal_net)} (MVA ${formatNOK(inv.vat_total)})</span></td>
        <td><span style="font-family: monospace; font-size: 0.82rem; color: #475569;">${inv.kid_number || '-'}</span></td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button type="button" class="btn-primary-sm" onclick="openInvoiceViewer(${inv.id})" style="background: #0F172A; color: white; border: none; padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">
              👁️ Vis / PDF
            </button>
            <button type="button" class="btn-primary-sm" onclick="sendInvoiceEmailDirect(${inv.id})" title="Send e-post til kunde" style="background: #F1F5F9; color: #0F172A; border: 1px solid var(--admin-border); padding: 0.35rem 0.55rem; border-radius: 6px; font-size: 0.78rem; cursor: pointer;">
              ✉️
            </button>
            ${inv.status !== 'Betalt' ? `
              <button type="button" class="btn-primary-sm" onclick="quickMarkInvoicePaid(${inv.id})" title="Registrer innbetaling" style="background: #DCFCE7; color: #166534; border: 1px solid #BBF7D0; padding: 0.35rem 0.55rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">
                ✓
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterInvoicesByStatus(status) {
  document.querySelectorAll(".inv-filter-btn").forEach(btn => {
    if (btn.dataset.status === status) {
      btn.classList.add("active");
      btn.style.background = "#0F172A";
      btn.style.color = "white";
    } else {
      btn.classList.remove("active");
      btn.style.background = "white";
      btn.style.color = "#475569";
    }
  });
  const search = document.getElementById("inv-search-input") ? document.getElementById("inv-search-input").value : "";
  loadInvoices(status, search);
}

function handleInvoiceSearch(query) {
  loadInvoices(activeInvoiceFilter, query);
}

// Open Invoice Viewer Modal
async function openInvoiceViewer(invoiceId) {
  const modal = document.getElementById("modal-invoice-viewer");
  if (!modal) return;

  modal.style.display = "flex";
  modal.classList.add("active");

  try {
    const res = await fetch(`/api/invoices/${invoiceId}`);
    const inv = data.invoice;
    const cs = data.company_settings || cachedCompanySettings || {
      company_name: "Servida AS",
      org_number: "932 847 192 MVA",
      address: "Fjellveien 1, 5014 Bergen",
      invoice_email: "faktura@servida.no",
      phone: "55 12 34 56",
      bank_account: inv.account_number || "3624.12.98765"
    };
    activeInvoiceDetail = inv;

    document.getElementById("ivw-invoice-num").textContent = inv.invoice_number;
    const statusBadge = document.getElementById("ivw-status-badge");
    if (statusBadge) {
      statusBadge.textContent = inv.status === 'Betalt' ? '✓ Betalt' : (inv.status === 'Forfalt' ? '🔴 Forfalt' : '⏳ Utestående');
      statusBadge.style.color = inv.status === 'Betalt' ? '#166534' : (inv.status === 'Forfalt' ? '#991B1B' : '#DC2626');
    }

    // Dynamic Seller Information
    if (document.getElementById("ivw-seller-name-header")) document.getElementById("ivw-seller-name-header").textContent = cs.company_name || "Servida AS";
    if (document.getElementById("ivw-seller-org-header")) document.getElementById("ivw-seller-org-header").textContent = cs.org_number || "932 847 192 MVA";
    if (document.getElementById("ivw-seller-company")) document.getElementById("ivw-seller-company").textContent = cs.company_name || "Servida AS";
    if (document.getElementById("ivw-seller-address")) document.getElementById("ivw-seller-address").textContent = cs.address || "Fjellveien 1, 5014 Bergen";
    if (document.getElementById("ivw-seller-email")) document.getElementById("ivw-seller-email").textContent = cs.invoice_email || "faktura@servida.no";
    if (document.getElementById("ivw-seller-phone")) document.getElementById("ivw-seller-phone").textContent = cs.phone || "55 12 34 56";
    if (document.getElementById("ivw-seller-account")) document.getElementById("ivw-seller-account").textContent = cs.bank_account || inv.account_number || "3624.12.98765";

    // Customer Information
    document.getElementById("ivw-customer-name").textContent = inv.customer_name;
    document.getElementById("ivw-customer-address").textContent = inv.customer_address || "Ingen adresse spesifisert";
    document.getElementById("ivw-customer-email").textContent = inv.customer_email;
    document.getElementById("ivw-customer-phone").textContent = inv.customer_phone || '-';

    document.getElementById("ivw-invoice-date").textContent = inv.invoice_date;
    document.getElementById("ivw-due-date").textContent = inv.due_date;
    document.getElementById("ivw-kid-num").textContent = inv.kid_number || '-';
    document.getElementById("ivw-payment-method").textContent = inv.payment_method || 'Bankgiro / KID';

    // Lines
    const linesTbody = document.getElementById("ivw-lines-tbody");
    linesTbody.innerHTML = (inv.line_items || []).map(li => `
      <tr style="border-bottom: 1px solid var(--admin-border);">
        <td style="padding: 0.6rem 0.25rem;"><strong>${li.description}</strong></td>
        <td style="padding: 0.6rem 0.25rem; text-align: center;">${li.quantity}</td>
        <td style="padding: 0.6rem 0.25rem; text-align: right;">${formatNOK(li.unit_price)}</td>
        <td style="padding: 0.6rem 0.25rem; text-align: center;">${li.vat_rate}%</td>
        <td style="padding: 0.6rem 0.25rem; text-align: right;"><strong>${formatNOK(li.amount)}</strong></td>
      </tr>
    `).join("");

    document.getElementById("ivw-giro-kid").textContent = inv.kid_number || '-';
    document.getElementById("ivw-notes").textContent = inv.notes || '14 dagers betalingsfrist.';
    document.getElementById("ivw-subtotal-net").textContent = formatNOK(inv.subtotal_net);
    document.getElementById("ivw-vat-total").textContent = formatNOK(inv.vat_total);
    document.getElementById("ivw-total-gross").textContent = formatNOK(inv.total_gross);

    const btnPaid = document.getElementById("btn-ivw-mark-paid");
    if (btnPaid) {
      btnPaid.style.display = inv.status === 'Betalt' ? 'none' : 'flex';
    }
  } catch (err) {
    alert("Feil ved åpning av faktura: " + err.message);
  }
}

function closeInvoiceViewer() {
  const modal = document.getElementById("modal-invoice-viewer");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
}

async function markActiveInvoicePaid() {
  if (!activeInvoiceDetail) return;
  if (!confirm(`Vil du registrere ${activeInvoiceDetail.invoice_number} som innbetalt?`)) return;

  try {
    const res = await fetch(`/api/invoices/${activeInvoiceDetail.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Betalt" })
    });
    if (!res.ok) throw new Error("Kunne ikke oppdatere betalingsstatus.");
    alert("✓ Innbetaling registrert! Status er satt til Betalt.");
    closeInvoiceViewer();
    loadInvoices();
  } catch (err) {
    alert(err.message);
  }
}

async function quickMarkInvoicePaid(invoiceId) {
  if (!confirm("Registrere innbetaling for denne fakturaen?")) return;
  try {
    const res = await fetch(`/api/invoices/${invoiceId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Betalt" })
    });
    if (!res.ok) throw new Error("Kunne ikke registrere innbetaling.");
    alert("✓ Faktura er merket som betalt!");
    loadInvoices();
  } catch (err) {
    alert(err.message);
  }
}

async function sendActiveInvoiceEmail() {
  if (!activeInvoiceDetail) return;
  const btn = document.getElementById("btn-ivw-send-email");
  if (btn) { btn.disabled = true; btn.textContent = "Sender..."; }

  try {
    const res = await fetch(`/api/invoices/${activeInvoiceDetail.id}/send-email`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Kunne ikke sende faktura.");
    alert(`✓ ${data.message}`);
  } catch (err) {
    alert("Feil ved sending: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✉️ Send e-post til kunde"; }
  }
}

async function sendInvoiceEmailDirect(invoiceId) {
  try {
    const res = await fetch(`/api/invoices/${invoiceId}/send-email`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Kunne ikke sende faktura.");
    alert(`✓ ${data.message}`);
  } catch (err) {
    alert("Feil ved sending: " + err.message);
  }
}

// Create Invoice Modal Controller
function openCreateInvoiceModal(prefillData = null) {
  const modal = document.getElementById("modal-create-invoice");
  if (!modal) return;

  const now = new Date();
  const due = new Date();
  due.setDate(now.getDate() + 14);

  document.getElementById("inv-create-order-id").value = prefillData ? prefillData.order_id || "" : "";
  document.getElementById("inv-create-customer-name").value = prefillData ? prefillData.customer_name || "" : "";
  document.getElementById("inv-create-customer-email").value = prefillData ? prefillData.customer_email || "" : "";
  document.getElementById("inv-create-customer-phone").value = prefillData ? prefillData.customer_phone || "" : "";
  document.getElementById("inv-create-customer-address").value = prefillData ? prefillData.customer_address || "" : "";
  document.getElementById("inv-create-customer-org").value = prefillData ? prefillData.customer_org_nr || "" : "";
  document.getElementById("inv-create-date").value = prefillData ? prefillData.invoice_date : now.toISOString().split('T')[0];
  document.getElementById("inv-create-due-date").value = prefillData ? prefillData.due_date : due.toISOString().split('T')[0];
  document.getElementById("inv-create-account").value = prefillData ? prefillData.account_number || "3624.12.98765" : (cachedCompanySettings ? cachedCompanySettings.bank_account : "3624.12.98765");
  document.getElementById("inv-create-notes").value = prefillData ? prefillData.notes : (cachedCompanySettings ? cachedCompanySettings.invoice_footer_note : "Faktura for utført håndverkertjeneste. 14 dagers betalingsfrist. Takk for at du valgte Servida!");

  const tbody = document.getElementById("inv-create-lines-tbody");
  tbody.innerHTML = "";

  if (prefillData && prefillData.line_items && prefillData.line_items.length > 0) {
    prefillData.line_items.forEach(li => {
      addInvoiceLineItemRow(li.description, li.quantity, li.unit_price, li.vat_rate || 25);
    });
  } else {
    addInvoiceLineItemRow("Montering / Utført håndverkertjeneste", 1, 1490, 25);
  }

  calcInvoiceModalTotals();

  modal.style.display = "flex";
  modal.classList.add("active");
  setTimeout(() => document.getElementById("inv-create-customer-name").focus(), 150);
}

function closeCreateInvoiceModal() {
  const modal = document.getElementById("modal-create-invoice");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
}

async function openCreateInvoiceForOrder(orderId) {
  if (!orderId) {
    openCreateInvoiceModal();
    return;
  }
  try {
    const res = await fetch(`/api/invoices/from-order/${orderId}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Kunne ikke hente ordredata.");
    openCreateInvoiceModal(data);
  } catch (err) {
    alert("Feil: " + err.message);
  }
}

function addInvoiceLineItemRow(desc = "", qty = 1, unitPrice = 0, vatRate = 25) {
  const tbody = document.getElementById("inv-create-lines-tbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.style.borderBottom = "1px solid var(--admin-border)";
  tr.innerHTML = `
    <td style="padding: 0.4rem 0.5rem;">
      <input type="text" class="inv-line-desc" value="${desc}" placeholder="Beskrivelse av vare/tjeneste" required style="width: 100%; height: 34px; border: 1px solid var(--admin-border); border-radius: 4px; padding: 0 0.5rem; font-size: 0.85rem;">
    </td>
    <td style="padding: 0.4rem 0.25rem;">
      <input type="number" class="inv-line-qty" value="${qty}" step="0.5" min="0.5" oninput="calcInvoiceModalTotals()" style="width: 100%; height: 34px; border: 1px solid var(--admin-border); border-radius: 4px; padding: 0 0.3rem; text-align: center; font-size: 0.85rem;">
    </td>
    <td style="padding: 0.4rem 0.25rem;">
      <input type="number" class="inv-line-price" value="${unitPrice}" step="1" min="0" oninput="calcInvoiceModalTotals()" style="width: 100%; height: 34px; border: 1px solid var(--admin-border); border-radius: 4px; padding: 0 0.4rem; text-align: right; font-size: 0.85rem; font-weight: 700;">
    </td>
    <td style="padding: 0.4rem 0.25rem; text-align: center;">
      <select class="inv-line-vat" onchange="calcInvoiceModalTotals()" style="height: 34px; border: 1px solid var(--admin-border); border-radius: 4px; padding: 0 0.25rem; font-size: 0.82rem;">
        <option value="25.0" ${vatRate === 25 ? 'selected' : ''}>25%</option>
        <option value="15.0" ${vatRate === 15 ? 'selected' : ''}>15%</option>
        <option value="0.0" ${vatRate === 0 ? 'selected' : ''}>0%</option>
      </select>
    </td>
    <td style="padding: 0.4rem 0.5rem; text-align: right;">
      <strong class="inv-line-sum" style="color: #0F172A; font-size: 0.88rem;">${formatNOK(qty * unitPrice)}</strong>
    </td>
    <td style="padding: 0.4rem 0.25rem; text-align: center;">
      <button type="button" onclick="removeInvoiceLineItemRow(this)" style="background: none; border: none; color: #DC2626; cursor: pointer; font-size: 1rem;">✕</button>
    </td>
  `;
  tbody.appendChild(tr);
  calcInvoiceModalTotals();
}

function removeInvoiceLineItemRow(btn) {
  const tr = btn.closest("tr");
  if (tr) tr.remove();
  calcInvoiceModalTotals();
}

function calcInvoiceModalTotals() {
  const rows = document.querySelectorAll("#inv-create-lines-tbody tr");
  let subtotalNet = 0;

  rows.forEach(tr => {
    const qty = parseFloat(tr.querySelector(".inv-line-qty")?.value) || 0;
    const price = parseFloat(tr.querySelector(".inv-line-price")?.value) || 0;
    const lineSum = qty * price;
    subtotalNet += lineSum;

    const sumElem = tr.querySelector(".inv-line-sum");
    if (sumElem) sumElem.textContent = formatNOK(lineSum);
  });

  const vatTotal = roundNumber(subtotalNet * 0.25, 2);
  const totalGross = roundNumber(subtotalNet + vatTotal, 2);

  const calcNetElem = document.getElementById("inv-calc-net");
  const calcVatElem = document.getElementById("inv-calc-vat");
  const calcGrossElem = document.getElementById("inv-calc-gross");

  if (calcNetElem) calcNetElem.textContent = formatNOK(subtotalNet);
  if (calcVatElem) calcVatElem.textContent = formatNOK(vatTotal);
  if (calcGrossElem) calcGrossElem.textContent = formatNOK(totalGross);
}

function roundNumber(num, scale) {
  if (!("" + num).includes("e")) {
    return +(Math.round(num + "e+" + scale) + "e-" + scale);
  } else {
    var arr = ("" + num).split("e");
    var sig = "";
    if (+arr[1] + scale > 0) {
      sig = "+";
    }
    return +(Math.round(+arr[0] + "e" + sig + (+arr[1] + scale)) + "e-" + scale);
  }
}

// Form Submit Handler for Creating Invoices
const formCreateInvoice = document.getElementById("form-create-invoice");
if (formCreateInvoice) {
  formCreateInvoice.addEventListener("submit", async () => {
    const order_id = parseInt(document.getElementById("inv-create-order-id").value) || null;
    const customer_name = document.getElementById("inv-create-customer-name").value.trim();
    const customer_email = document.getElementById("inv-create-customer-email").value.trim();
    const customer_phone = document.getElementById("inv-create-customer-phone").value.trim();
    const customer_address = document.getElementById("inv-create-customer-address").value.trim();
    const customer_org_nr = document.getElementById("inv-create-customer-org").value.trim();
    const invoice_date = document.getElementById("inv-create-date").value;
    const due_date = document.getElementById("inv-create-due-date").value;
    const account_number = document.getElementById("inv-create-account").value;
    const notes = document.getElementById("inv-create-notes").value.trim();

    // Collect line items
    const lineItems = [];
    document.querySelectorAll("#inv-create-lines-tbody tr").forEach(tr => {
      const desc = tr.querySelector(".inv-line-desc")?.value.trim();
      const qty = parseFloat(tr.querySelector(".inv-line-qty")?.value) || 1;
      const price = parseFloat(tr.querySelector(".inv-line-price")?.value) || 0;
      const vat = parseFloat(tr.querySelector(".inv-line-vat")?.value) || 25;
      if (desc) {
        lineItems.push({
          description: desc,
          quantity: qty,
          unit_price: price,
          vat_rate: vat,
          amount: qty * price
        });
      }
    });

    if (lineItems.length === 0) {
      alert("Vennligst legg til minst én fakturalinje.");
      return;
    }

    const btnSub = document.getElementById("btn-submit-create-invoice");
    btnSub.disabled = true;
    btnSub.textContent = "Oppretter...";

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id,
          customer_name,
          customer_email,
          customer_phone,
          customer_address,
          customer_org_nr,
          invoice_date,
          due_date,
          account_number,
          line_items: lineItems,
          notes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke opprette faktura.");

      alert(`✓ ${data.message}`);
      closeCreateInvoiceModal();
      loadInvoices();
    } catch (err) {
      alert("Feil: " + err.message);
    } finally {
      btnSub.disabled = false;
      btnSub.textContent = "💾 Opprett & Send Faktura";
    }
  });
}

function exportInvoicesCSV() {
  if (!allInvoicesCache || allInvoicesCache.length === 0) {
    alert("Ingen fakturaer å eksportere.");
    return;
  }

  let csv = "SERVIDA AS - FAKTURASYSTEM & JOURNAL\n";
  csv += `Eksportert dato;${new Date().toLocaleDateString('no-NO')} ${new Date().toLocaleTimeString('no-NO')}\n\n`;
  csv += "Fakturanr;Kunde;E-post;Telefon;Fakturadato;Forfallsdato;Netto (NOK);MVA (NOK);Brutto (NOK);KID;Status\n";

  allInvoicesCache.forEach(i => {
    csv += `"${i.invoice_number}";"${i.customer_name}";"${i.customer_email}";"${i.customer_phone || ''}";"${i.invoice_date}";"${i.due_date}";${i.subtotal_net};${i.vat_total};${i.total_gross};"${i.kid_number || ''}";"${i.status}"\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Servida_Fakturajournal_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


// ==========================================================================
// GLOBAL WINDOW EXPORTS (For robust inline onclick triggers)
// ==========================================================================
window.switchCalMode = switchCalMode;
window.loadMonthCalendar = loadMonthCalendar;
window.loadCalendarDispatch = loadCalendarDispatch;
window.goToDayDispatch = goToDayDispatch;
window.openOrderDrawer = openOrderDrawer;
window.closeOrderDrawer = closeOrderDrawer;
window.openEditEmployeeModal = openEditEmployeeModal;
window.openEditEmployeeModalById = openEditEmployeeModalById;
window.closeEditEmployeeModal = closeEditEmployeeModal;
window.openAdminLogHoursModal = openAdminLogHoursModal;
window.closeAdminLogHoursModal = closeAdminLogHoursModal;
window.openContractViewer = openContractViewer;
window.closeContractViewer = closeContractViewer;
window.openCreateEmployeeModal = () => {
  const modal = document.getElementById("modal-create-employee");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("active");
    document.getElementById("new-emp-name").value = "";
    document.getElementById("new-emp-phone").value = "";
    document.getElementById("new-emp-email").value = "";
    document.getElementById("new-emp-password").value = "";
    document.getElementById("new-emp-specialty").value = "";
    document.getElementById("new-emp-bio").value = "";
    document.getElementById("create-emp-error-msg").style.display = "none";
    setTimeout(() => document.getElementById("new-emp-name").focus(), 150);
  }
};
window.closeCreateEmployeeModal = closeCreateEmployeeModal;
window.openCreateExpenseModal = openCreateExpenseModal;
window.closeCreateExpenseModal = closeCreateExpenseModal;
window.exportAccountingCSV = exportAccountingCSV;
window.deleteExpense = deleteExpense;
window.openHandymanProfileView = openHandymanProfileView;
window.openComposeEmailModal = openComposeEmailModal;
window.closeComposeEmailModal = closeComposeEmailModal;
window.saveServicePrice = saveServicePrice;
window.openPdfViewerModal = openPdfViewerModal;
window.closePdfViewerModal = closePdfViewerModal;

// Invoices exports
window.loadInvoices = loadInvoices;
window.filterInvoicesByStatus = filterInvoicesByStatus;
window.handleInvoiceSearch = handleInvoiceSearch;
window.openInvoiceViewer = openInvoiceViewer;
window.closeInvoiceViewer = closeInvoiceViewer;
window.markActiveInvoicePaid = markActiveInvoicePaid;
window.quickMarkInvoicePaid = quickMarkInvoicePaid;
window.sendActiveInvoiceEmail = sendActiveInvoiceEmail;
window.sendInvoiceEmailDirect = sendInvoiceEmailDirect;
window.openCreateInvoiceModal = openCreateInvoiceModal;
window.closeCreateInvoiceModal = closeCreateInvoiceModal;
window.openCreateInvoiceForOrder = openCreateInvoiceForOrder;
window.addInvoiceLineItemRow = addInvoiceLineItemRow;
window.removeInvoiceLineItemRow = removeInvoiceLineItemRow;
window.calcInvoiceModalTotals = calcInvoiceModalTotals;
window.exportInvoicesCSV = exportInvoicesCSV;

// ==========================================================================
// 17. COMPANY & SELLER SETTINGS CONTROLLER
// ==========================================================================

let cachedCompanySettings = null;

async function loadCompanySettings() {
  try {
    const res = await fetch("/api/company-settings");
    const data = await res.json();
    if (res.ok && data.settings) {
      cachedCompanySettings = data.settings;
      return cachedCompanySettings;
    }
  } catch (err) {
    console.error("Kunne ikke laste bedriftsinnstillinger:", err);
  }
  return null;
}

async function openCompanySettingsModal() {
  const modal = document.getElementById("modal-company-settings");
  if (!modal) return;

  const settings = await loadCompanySettings() || {
    company_name: "Servida AS",
    org_number: "932 847 192 MVA",
    address: "Fjellveien 1, 5014 Bergen",
    post_code: "5014",
    city: "Bergen",
    invoice_email: "faktura@servida.no",
    support_email: "post@servida.no",
    phone: "55 12 34 56",
    bank_account: "3624.12.98765",
    iban: "NO93 3624 1298 765",
    swift_bic: "DNBANOKK",
    default_due_days: 14,
    invoice_footer_note: "Takk for at du valgte Servida AS! Faktura for utført arbeid iht. avtale."
  };

  document.getElementById("cs-company-name").value = settings.company_name || "";
  document.getElementById("cs-org-number").value = settings.org_number || "";
  document.getElementById("cs-address").value = settings.address || "";
  document.getElementById("cs-post-code").value = settings.post_code || "";
  document.getElementById("cs-city").value = settings.city || "";
  document.getElementById("cs-invoice-email").value = settings.invoice_email || "";
  document.getElementById("cs-support-email").value = settings.support_email || "";
  document.getElementById("cs-phone").value = settings.phone || "";
  document.getElementById("cs-bank-account").value = settings.bank_account || "";
  document.getElementById("cs-iban").value = settings.iban || "";
  document.getElementById("cs-due-days").value = settings.default_due_days || 14;
  document.getElementById("cs-footer-note").value = settings.invoice_footer_note || "";

  modal.style.display = "flex";
  modal.classList.add("active");
  setTimeout(() => document.getElementById("cs-company-name").focus(), 150);
}

function closeCompanySettingsModal() {
  const modal = document.getElementById("modal-company-settings");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
}

const formCompanySettings = document.getElementById("form-company-settings");
if (formCompanySettings) {
  formCompanySettings.addEventListener("submit", async () => {
    const payload = {
      company_name: document.getElementById("cs-company-name").value.trim(),
      org_number: document.getElementById("cs-org-number").value.trim(),
      address: document.getElementById("cs-address").value.trim(),
      post_code: document.getElementById("cs-post-code").value.trim(),
      city: document.getElementById("cs-city").value.trim(),
      invoice_email: document.getElementById("cs-invoice-email").value.trim(),
      support_email: document.getElementById("cs-support-email").value.trim(),
      phone: document.getElementById("cs-phone").value.trim(),
      bank_account: document.getElementById("cs-bank-account").value.trim(),
      iban: document.getElementById("cs-iban").value.trim(),
      default_due_days: parseInt(document.getElementById("cs-due-days").value) || 14,
      invoice_footer_note: document.getElementById("cs-footer-note").value.trim()
    };

    const btnSub = document.getElementById("btn-submit-company-settings");
    btnSub.disabled = true;
    btnSub.textContent = "Lagrer...";

    try {
      const res = await fetch("/api/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Kunne ikke lagre bedriftsopplysninger.");

      cachedCompanySettings = payload;
      alert("✓ Bedriftsprofil og fakturainnstillinger er oppdatert!");
      closeCompanySettingsModal();

      // Update active viewer if open
      if (document.getElementById("ivw-seller-name-header")) {
        document.getElementById("ivw-seller-name-header").textContent = payload.company_name;
        document.getElementById("ivw-seller-org-header").textContent = payload.org_number;
        document.getElementById("ivw-seller-company").textContent = payload.company_name;
        document.getElementById("ivw-seller-address").textContent = payload.address;
        document.getElementById("ivw-seller-email").textContent = payload.invoice_email;
        document.getElementById("ivw-seller-phone").textContent = payload.phone;
        document.getElementById("ivw-seller-account").textContent = payload.bank_account;
      }
    } catch (err) {
      alert("Feil: " + err.message);
    } finally {
      btnSub.disabled = false;
      btnSub.textContent = "💾 Lagre Bedriftsopplysninger";
    }
  });
}

// ==========================================================================
// GLOBAL WINDOW EXPORTS (For robust inline onclick triggers)
// ==========================================================================
window.switchCalMode = switchCalMode;
window.loadMonthCalendar = loadMonthCalendar;
window.loadCalendarDispatch = loadCalendarDispatch;
window.goToDayDispatch = goToDayDispatch;
window.openOrderDrawer = openOrderDrawer;
window.closeOrderDrawer = closeOrderDrawer;
window.openEditEmployeeModal = openEditEmployeeModal;
window.openEditEmployeeModalById = openEditEmployeeModalById;
window.closeEditEmployeeModal = closeEditEmployeeModal;
window.openAdminLogHoursModal = openAdminLogHoursModal;
window.closeAdminLogHoursModal = closeAdminLogHoursModal;
window.openContractViewer = openContractViewer;
window.closeContractViewer = closeContractViewer;
window.openCreateEmployeeModal = () => {
  const modal = document.getElementById("modal-create-employee");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("active");
    document.getElementById("new-emp-name").value = "";
    document.getElementById("new-emp-phone").value = "";
    document.getElementById("new-emp-email").value = "";
    document.getElementById("new-emp-password").value = "";
    document.getElementById("new-emp-specialty").value = "";
    document.getElementById("new-emp-bio").value = "";
    document.getElementById("create-emp-error-msg").style.display = "none";
    setTimeout(() => document.getElementById("new-emp-name").focus(), 150);
  }
};
window.closeCreateEmployeeModal = closeCreateEmployeeModal;
window.openCreateExpenseModal = openCreateExpenseModal;
window.closeCreateExpenseModal = closeCreateExpenseModal;
window.exportAccountingCSV = exportAccountingCSV;
window.deleteExpense = deleteExpense;
window.openHandymanProfileView = openHandymanProfileView;
window.openComposeEmailModal = openComposeEmailModal;
window.closeComposeEmailModal = closeComposeEmailModal;
window.saveServicePrice = saveServicePrice;
window.openPdfViewerModal = openPdfViewerModal;
window.closePdfViewerModal = closePdfViewerModal;

// Invoices exports
window.loadInvoices = loadInvoices;
window.filterInvoicesByStatus = filterInvoicesByStatus;
window.handleInvoiceSearch = handleInvoiceSearch;
window.openInvoiceViewer = openInvoiceViewer;
window.closeInvoiceViewer = closeInvoiceViewer;
window.markActiveInvoicePaid = markActiveInvoicePaid;
window.quickMarkInvoicePaid = quickMarkInvoicePaid;
window.sendActiveInvoiceEmail = sendActiveInvoiceEmail;
window.sendInvoiceEmailDirect = sendInvoiceEmailDirect;
window.openCreateInvoiceModal = openCreateInvoiceModal;
window.closeCreateInvoiceModal = closeCreateInvoiceModal;
window.openCreateInvoiceForOrder = openCreateInvoiceForOrder;
window.addInvoiceLineItemRow = addInvoiceLineItemRow;
window.removeInvoiceLineItemRow = removeInvoiceLineItemRow;
window.calcInvoiceModalTotals = calcInvoiceModalTotals;
window.exportInvoicesCSV = exportInvoicesCSV;

// Email hub exports
window.openEmailDetail = openEmailDetail;
window.replyToCurrentEmail = replyToCurrentEmail;
window.forwardCurrentEmail = forwardCurrentEmail;
window.deleteEmailItem = deleteEmailItem;
window.loadEmails = loadEmails;
window.switchEmailFolder = switchEmailFolder;
window.filterEmailCategory = filterEmailCategory;
window.openEmailSettingsModal = openEmailSettingsModal;
window.closeEmailSettingsModal = closeEmailSettingsModal;

// Company settings exports
window.openCompanySettingsModal = openCompanySettingsModal;
window.closeCompanySettingsModal = closeCompanySettingsModal;
window.loadCompanySettings = loadCompanySettings;









