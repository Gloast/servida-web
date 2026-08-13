/**
 * SERVIDA STOREFRONT ENGINE
 * Fast, reactive service catalog, dynamic price calculator, and frictionless booking flow.
 */

// State
let allServices = [];
let allCategories = [];
let activeCategory = "all";
let currentSort = "popular";
let currentSearch = "";

let activeService = null;
let selectedVariant = null;
let selectedAddons = [];
let currentStep = 1;
let selectedTimeSlot = "08:00 - 12:00";

// DOM Elements
const categoryPillsContainer = document.getElementById("category-pills-container");
const servicesGrid = document.getElementById("services-grid");
const servicesCountDisplay = document.getElementById("services-count-display");
const currentCategoryHeading = document.getElementById("current-category-heading");
const globalSearchInput = document.getElementById("global-search-input");
const sortSelect = document.getElementById("sort-select");
const noResultsState = document.getElementById("no-results-state");
const btnResetFilters = document.getElementById("btn-reset-filters");

// Postcode checker
const postcodeCheckInput = document.getElementById("postcode-check-input");
const btnCheckPostcode = document.getElementById("btn-check-postcode");
const postcodeStatusMsg = document.getElementById("postcode-status-msg");

// Modal Elements
const serviceModal = document.getElementById("service-modal");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalImg = document.getElementById("modal-img");
const modalTitle = document.getElementById("modal-title");
const modalDesc = document.getElementById("modal-desc");
const modalWarranty = document.getElementById("modal-warranty");
const modalTime = document.getElementById("modal-time");
const modalCategory = document.getElementById("modal-category");
const modalVariantsContainer = document.getElementById("modal-variants-container");
const modalAddonsContainer = document.getElementById("modal-addons-container");
const modalIncludedList = document.getElementById("modal-included-list");
const modalLiveTotal = document.getElementById("modal-live-total");
const modalFooterBar = document.getElementById("modal-footer-bar");
const btnModalNext = document.getElementById("btn-modal-next");
const btnModalBack = document.getElementById("btn-modal-back");
const btnCloseSuccess = document.getElementById("btn-close-success");

// Form Inputs
const inpStreet = document.getElementById("inp-street");
const inpPostcode = document.getElementById("inp-postcode");
const inpCity = document.getElementById("inp-city");
const inpDate = document.getElementById("inp-date");
const inpName = document.getElementById("inp-name");
const inpPhone = document.getElementById("inp-phone");
const inpEmail = document.getElementById("inp-email");
const inpNotes = document.getElementById("inp-notes");

// Confirmation Elements
const confOrderNum = document.getElementById("conf-order-num");
const confServiceTitle = document.getElementById("conf-service-title");
const confDatetime = document.getElementById("conf-datetime");
const confAddress = document.getElementById("conf-address");
const confTotalPrice = document.getElementById("conf-total-price");

// Standard Service Add-on Options Catalog
const COMMON_ADDONS = [
  { id: "addon-waste", name: "Bortkjøring av avfall og emballasje", price: 890.0 },
  { id: "addon-demo", name: "Demontering / riving av gammelt element", price: 690.0 },
  { id: "addon-supplies", name: "Ekstra profesjonelt festemateriell & fug", price: 290.0 },
  { id: "addon-express", name: "Ekspressoppmøte (innen 24 timer)", price: 490.0 }
];

// Helper format currency
function formatNOK(amount) {
  return "kr " + Math.round(amount).toLocaleString("no-NO") + ",-";
}

// 1. Initialize and load catalog
async function loadCatalog() {
  try {
    const res = await fetch("/api/catalog");
    if (!res.ok) throw new Error("Kunne ikke laste katalog");
    const data = await res.json();
    
    allCategories = data.categories || [];
    allServices = data.services || [];
    
    renderCategoryPills();
    renderServices();
    initDateDefaults();
  } catch (err) {
    console.error(err);
    servicesCountDisplay.textContent = "Feil ved innlasting av tjenester. Vennligst prøv igjen.";
  }
}

// 2. Render category pills
function renderCategoryPills() {
  categoryPillsContainer.innerHTML = `
    <button class="category-pill-btn active" data-category="all">
      <span>✨</span> Alle tjenester (${allServices.length})
    </button>
  `;
  
  allCategories.forEach(cat => {
    const count = allServices.filter(s => s.category === cat.name).length;
    if (count > 0) {
      const btn = document.createElement("button");
      btn.className = "category-pill-btn";
      btn.dataset.category = cat.name;
      btn.innerHTML = `<span>${cat.icon}</span> ${cat.name} (${count})`;
      btn.addEventListener("click", () => {
        setCategory(cat.name);
      });
      categoryPillsContainer.appendChild(btn);
    }
  });
  
  categoryPillsContainer.querySelector('[data-category="all"]').addEventListener("click", () => {
    setCategory("all");
  });
}

function setCategory(catName) {
  activeCategory = catName;
  document.querySelectorAll(".category-pill-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.category === catName);
  });
  
  if (catName === "all") {
    currentCategoryHeading.textContent = "Alle håndverkertjenester";
  } else {
    currentCategoryHeading.textContent = catName;
  }
  
  renderServices();
}

// 3. Filter & Sort services
function getFilteredServices() {
  let filtered = [...allServices];
  
  if (activeCategory !== "all") {
    filtered = filtered.filter(s => s.category === activeCategory);
  }
  
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase().trim();
    filtered = filtered.filter(s => 
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }
  
  if (currentSort === "price-asc") {
    filtered.sort((a, b) => a.price_from - b.price_from);
  } else if (currentSort === "price-desc") {
    filtered.sort((a, b) => b.price_from - a.price_from);
  } else if (currentSort === "title") {
    filtered.sort((a, b) => a.title.localeCompare(b.title, "no"));
  } else {
    // popular
    filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }
  
  return filtered;
}

// 4. Render service cards
function renderServices() {
  const filtered = getFilteredServices();
  
  servicesCountDisplay.textContent = `Viser ${filtered.length} av ${allServices.length} fastprisoppdrag`;
  
  if (filtered.length === 0) {
    servicesGrid.innerHTML = "";
    noResultsState.style.display = "block";
    return;
  }
  
  noResultsState.style.display = "none";
  servicesGrid.innerHTML = "";
  
  filtered.forEach(s => {
    const card = document.createElement("article");
    card.className = "service-card";
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Se detaljer for ${s.title}`);
    
    const imgUrl = s.image_url || "/static/images/hero-handyman.jpg";
    const warrantyText = s.warranty || "2 års garanti";
    
    card.innerHTML = `
      <div class="service-card-img-wrap">
        <img src="${imgUrl}" alt="${s.title}" class="service-card-img" loading="lazy">
        <div class="service-warranty-badge">🛡️ ${warrantyText}</div>
        <div class="service-category-tag">${s.category}</div>
      </div>
      <div class="service-card-body">
        <h3 class="service-card-title">${s.title}</h3>
        <p class="service-card-desc">${s.short_description}</p>
        <div class="service-card-footer">
          <div class="service-price-block">
            <span class="price-label">Fastpris fra</span>
            <span class="price-value">${formatNOK(s.price_from)}</span>
          </div>
          <button class="btn-book-sm">Reserver tid</button>
        </div>
      </div>
    `;
    
    card.addEventListener("click", () => openServiceModal(s));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openServiceModal(s);
      }
    });
    
    servicesGrid.appendChild(card);
  });
}

// 5. Open and populate Service & Booking Modal
function openServiceModal(service) {
  activeService = service;
  currentStep = 1;
  selectedAddons = [];
  
  // Setup header
  modalImg.src = service.image_url || "/static/images/hero-handyman.jpg";
  modalImg.alt = service.title;
  modalTitle.textContent = service.title;
  modalDesc.textContent = service.description;
  modalWarranty.textContent = `🛡️ ${service.warranty || "2 års garanti"}`;
  modalTime.textContent = `⏱️ ${service.estimated_hours || "1–3 timer"}`;
  modalCategory.textContent = service.category;
  
  // Populate variants
  modalVariantsContainer.innerHTML = "";
  const variants = service.variants && service.variants.length > 0 
    ? service.variants 
    : [{ name: "Standard utførelse", price: service.price_from }];
    
  selectedVariant = variants[0];
  
  variants.forEach((v, idx) => {
    const vCard = document.createElement("div");
    vCard.className = `variant-radio-card ${idx === 0 ? "selected" : ""}`;
    vCard.innerHTML = `
      <strong>${v.name}</strong>
      <span>${formatNOK(v.price)}</span>
    `;
    vCard.addEventListener("click", () => {
      document.querySelectorAll(".variant-radio-card").forEach(c => c.classList.remove("selected"));
      vCard.classList.add("selected");
      selectedVariant = v;
      updateLiveTotal();
    });
    modalVariantsContainer.appendChild(vCard);
  });
  
  // Populate Add-ons
  modalAddonsContainer.innerHTML = "";
  COMMON_ADDONS.forEach(addon => {
    const item = document.createElement("div");
    item.className = "addon-item";
    item.innerHTML = `
      <div class="addon-left">
        <input type="checkbox" id="addon-${addon.id}">
        <label for="addon-${addon.id}" style="font-size: 0.88rem; font-weight: 600; color: var(--color-primary); cursor: pointer;">
          ${addon.name}
        </label>
      </div>
      <div class="addon-price">+ ${formatNOK(addon.price)}</div>
    `;
    
    const checkbox = item.querySelector("input");
    item.addEventListener("click", (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      item.classList.toggle("selected", checkbox.checked);
      if (checkbox.checked) {
        selectedAddons.push(addon);
      } else {
        selectedAddons = selectedAddons.filter(a => a.id !== addon.id);
      }
      updateLiveTotal();
    });
    
    modalAddonsContainer.appendChild(item);
  });
  
  // Populate Included List
  modalIncludedList.innerHTML = "";
  const includedItems = Array.isArray(service.included) ? service.included : [service.included];
  includedItems.forEach(inc => {
    if (inc && inc.trim()) {
      const li = document.createElement("li");
      li.textContent = inc.trim();
      modalIncludedList.appendChild(li);
    }
  });
  
  updateLiveTotal();
  setModalStep(1);
  
  // Open modal
  serviceModal.classList.add("active");
  serviceModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function updateLiveTotal() {
  let total = selectedVariant ? selectedVariant.price : (activeService ? activeService.price_from : 0);
  selectedAddons.forEach(a => {
    total += a.price;
  });
  modalLiveTotal.textContent = formatNOK(total);
}

function calculateCurrentTotal() {
  let total = selectedVariant ? selectedVariant.price : (activeService ? activeService.price_from : 0);
  selectedAddons.forEach(a => {
    total += a.price;
  });
  return total;
}

// Stepper navigation
function setModalStep(step) {
  currentStep = step;
  
  // Update Stepper Indicators
  for (let i = 1; i <= 4; i++) {
    const ind = document.getElementById(`step-ind-${i}`);
    const pane = document.getElementById(`step-pane-${i}`);
    
    if (ind) {
      ind.classList.remove("active", "completed");
      if (i === step) ind.classList.add("active");
      else if (i < step) ind.classList.add("completed");
    }
    
    if (pane) {
      pane.classList.toggle("active", i === step);
    }
  }
  
  // Update footer bar buttons
  if (step === 1) {
    btnModalBack.style.display = "none";
    btnModalNext.textContent = "Gå til tid & sted →";
    btnModalNext.style.display = "inline-flex";
    modalFooterBar.style.display = "flex";
  } else if (step === 2) {
    btnModalBack.style.display = "inline-flex";
    btnModalNext.textContent = "Gå til kontaktinfo →";
    btnModalNext.style.display = "inline-flex";
    modalFooterBar.style.display = "flex";
  } else if (step === 3) {
    btnModalBack.style.display = "inline-flex";
    btnModalNext.textContent = "Fullfør & bekreft reservasjon (0,- kr) ✓";
    btnModalNext.style.display = "inline-flex";
    modalFooterBar.style.display = "flex";
  } else if (step === 4) {
    modalFooterBar.style.display = "none"; // Success screen handles close
  }
}

// Next button handler with validation
btnModalNext.addEventListener("click", async () => {
  if (currentStep === 1) {
    setModalStep(2);
  } else if (currentStep === 2) {
    if (!inpStreet.value.trim() || !inpPostcode.value.trim() || !inpCity.value.trim()) {
      alert("Vennligst fyll inn gateadresse, postnummer og poststed.");
      return;
    }
    if (!inpDate.value) {
      alert("Vennligst velg en ønsket dato for oppmøte.");
      return;
    }
    setModalStep(3);
  } else if (currentStep === 3) {
    if (!inpName.value.trim() || !inpPhone.value.trim() || !inpEmail.value.trim()) {
      alert("Vennligst fyll inn navn, telefonnummer og e-postadresse.");
      return;
    }
    await submitBooking();
  }
});

btnModalBack.addEventListener("click", () => {
  if (currentStep > 1) {
    setModalStep(currentStep - 1);
  }
});

// Submit booking to API
async function submitBooking() {
  btnModalNext.disabled = true;
  btnModalNext.textContent = "Sender bestilling...";
  
  const payload = {
    service_handle: activeService.handle,
    service_title: activeService.title,
    variant_name: selectedVariant ? selectedVariant.name : "Standard",
    selected_options: selectedAddons.map(a => ({ name: a.name, price: a.price })),
    total_price: calculateCurrentTotal(),
    customer_name: inpName.value.trim(),
    customer_email: inpEmail.value.trim(),
    customer_phone: inpPhone.value.trim(),
    street_address: inpStreet.value.trim(),
    postal_code: inpPostcode.value.trim(),
    city: inpCity.value.trim(),
    preferred_date: inpDate.value,
    time_slot: selectedTimeSlot,
    notes: inpNotes.value.trim()
  };
  
  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error("Feil ved opprettelse av bestilling");
    const result = await res.json();
    
    // Populate confirmation pane
    confOrderNum.textContent = result.order_number;
    confServiceTitle.textContent = `${activeService.title} (${payload.variant_name})`;
    confDatetime.textContent = `${payload.preferred_date} (${payload.time_slot})`;
    confAddress.textContent = `${payload.street_address}, ${payload.postal_code} ${payload.city}`;
    confTotalPrice.textContent = formatNOK(payload.total_price);
    
    setModalStep(4);
  } catch (err) {
    console.error(err);
    alert("Beklager, noe gikk galt under innsending av bestillingen. Vennligst prøv igjen.");
  } finally {
    btnModalNext.disabled = false;
  }
}

// Close Modal handlers
function closeModal() {
  serviceModal.classList.remove("active");
  serviceModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

modalCloseBtn.addEventListener("click", closeModal);
if (btnCloseSuccess) btnCloseSuccess.addEventListener("click", closeModal);

serviceModal.addEventListener("click", (e) => {
  if (e.target === serviceModal) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && serviceModal.classList.contains("active")) {
    closeModal();
  }
});

// Time Slot Card Selector
document.querySelectorAll(".time-slot-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".time-slot-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    selectedTimeSlot = card.dataset.slot;
  });
});

// Search and Sort Event Listeners
globalSearchInput.addEventListener("input", (e) => {
  currentSearch = e.target.value;
  renderServices();
});

sortSelect.addEventListener("change", (e) => {
  currentSort = e.target.value;
  renderServices();
});

if (btnResetFilters) {
  btnResetFilters.addEventListener("click", () => {
    globalSearchInput.value = "";
    currentSearch = "";
    activeCategory = "all";
    document.querySelectorAll(".category-pill-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.category === "all");
    });
    currentCategoryHeading.textContent = "Alle håndverkertjenester";
    renderServices();
  });
}

// Postcode Checker logic
btnCheckPostcode.addEventListener("click", () => {
  const code = postcodeCheckInput.value.trim();
  if (!code || code.length < 4) {
    postcodeStatusMsg.style.display = "block";
    postcodeStatusMsg.style.color = "#DC2626";
    postcodeStatusMsg.textContent = "⚠️ Vennligst oppgi et gyldig 4-sifret postnummer.";
    return;
  }
  
  postcodeStatusMsg.style.display = "block";
  postcodeStatusMsg.style.color = "var(--color-accent)";
  postcodeStatusMsg.innerHTML = `✅ <strong>Postnummer ${code} er dekket!</strong> Vi har ledige håndverkere i ditt område denne uken.`;
  
  // Pre-fill modal postal code
  inpPostcode.value = code;
});

// Initialize default date (tomorrow)
function initDateDefaults() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  inpDate.value = `${yyyy}-${mm}-${dd}`;
  inpDate.min = `${yyyy}-${mm}-${dd}`;
}

// Start application
loadCatalog();
updateNavAuthDisplay();

// ==========================================================================
// CUSTOMER AUTHENTICATION & MIN SIDE LOGIC
// ==========================================================================

let currentUser = JSON.parse(localStorage.getItem('servida_customer_user')) || null;
let currentTrackingOrder = null;
let trackingMsgPoll = null;

// Auth Modal Elements
const authModal = document.getElementById("auth-modal");
const btnCloseAuth = document.getElementById("btn-close-auth");
const tabLoginBtn = document.getElementById("tab-login-btn");
const tabRegisterBtn = document.getElementById("tab-register-btn");
const authLoginPane = document.getElementById("auth-login-pane");
const authRegisterPane = document.getElementById("auth-register-pane");
const btnAccountNav = document.getElementById("btn-account-nav");
const navUserLabel = document.getElementById("nav-user-label");

// Login Form
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const btnSubmitLogin = document.getElementById("btn-submit-login");
const loginErrorMsg = document.getElementById("login-error-msg");

// Register Form
const regName = document.getElementById("reg-name");
const regEmail = document.getElementById("reg-email");
const regPhone = document.getElementById("reg-phone");
const regAddress = document.getElementById("reg-address");
const regPostcode = document.getElementById("reg-postcode");
const regCity = document.getElementById("reg-city");
const regPassword = document.getElementById("reg-password");
const btnSubmitRegister = document.getElementById("btn-submit-register");
const regErrorMsg = document.getElementById("reg-error-msg");

// Demo account chips
const chipDemoOle = document.getElementById("chip-demo-ole");
const chipDemoKari = document.getElementById("chip-demo-kari");

// Min Side Modal Elements
const minsideModal = document.getElementById("minside-modal");
const btnCloseMinside = document.getElementById("btn-close-minside");
const minsideUserName = document.getElementById("minside-user-name");
const minsideUserEmail = document.getElementById("minside-user-email");
const minsideOrdersCount = document.getElementById("minside-orders-count");
const minsideOrdersList = document.getElementById("minside-orders-list");
const btnLogout = document.getElementById("btn-logout");
const minsideTabs = document.querySelectorAll(".minside-tab");
const paneMinsideOrders = document.getElementById("pane-minside-orders");
const paneMinsideProfile = document.getElementById("pane-minside-profile");
const btnNewBookingFromPortal = document.getElementById("btn-new-booking-from-portal");

// Profile Form
const profName = document.getElementById("prof-name");
const profEmail = document.getElementById("prof-email");
const profPhone = document.getElementById("prof-phone");
const profAddress = document.getElementById("prof-address");
const profPostcode = document.getElementById("prof-postcode");
const profCity = document.getElementById("prof-city");
const profNewPassword = document.getElementById("prof-new-password");
const btnSaveProfile = document.getElementById("btn-save-profile");
const profileSuccessMsg = document.getElementById("profile-success-msg");

// Tracking Modal Elements
const orderDetailModal = document.getElementById("order-detail-modal");
const btnCloseTracking = document.getElementById("btn-close-tracking");
const trackStatusPill = document.getElementById("track-status-pill");
const trackServiceTitle = document.getElementById("track-service-title");
const trackOrderNum = document.getElementById("track-order-num");
const trackProgressSteps = document.getElementById("track-progress-steps");
const trackHandymanName = document.getElementById("track-handyman-name");
const trackHandymanStatusNote = document.getElementById("track-handyman-status-note");
const trackDatetime = document.getElementById("track-datetime");
const trackAddress = document.getElementById("track-address");
const trackVariant = document.getElementById("track-variant");
const trackTotalPrice = document.getElementById("track-total-price");
const trackPaymentBadge = document.getElementById("track-payment-badge");
const trackChatMessages = document.getElementById("track-chat-messages");
const chatNewMessageInput = document.getElementById("chat-new-message-input");
const btnSendChatMsg = document.getElementById("btn-send-chat-msg");
const trackReviewBox = document.getElementById("track-review-box");
const starRatingPicker = document.getElementById("star-rating-picker");
const reviewCommentInput = document.getElementById("review-comment-input");
const btnSubmitReview = document.getElementById("btn-submit-review");
const btnCancelOrderTrack = document.getElementById("btn-cancel-order-track");
const btnPrintReceipt = document.getElementById("btn-print-receipt");

// Quick Track Elements
const btnTrackOrderNav = document.getElementById("btn-track-order-nav");
const quickTrackModal = document.getElementById("quick-track-modal");
const btnCloseQuickTrack = document.getElementById("btn-close-quick-track");
const quickTrackInput = document.getElementById("quick-track-input");
const btnSubmitQuickTrack = document.getElementById("btn-submit-quick-track");
const quickTrackError = document.getElementById("quick-track-error");

let selectedReviewRating = 5;

// Update Header Nav Account Button
function updateNavAuthDisplay() {
  if (currentUser) {
    const firstName = currentUser.full_name ? currentUser.full_name.split(" ")[0] : "Min Side";
    navUserLabel.textContent = `👤 ${firstName}`;
    btnAccountNav.style.background = "#0F172A";
    btnAccountNav.style.color = "#FFFFFF";
    btnAccountNav.style.borderColor = "#0F172A";
  } else {
    navUserLabel.textContent = "Min Side / Logg inn";
    btnAccountNav.style.background = "var(--color-bg-alt)";
    btnAccountNav.style.color = "var(--color-primary)";
    btnAccountNav.style.borderColor = "var(--color-border)";
  }
}

// Nav Account Button Click
btnAccountNav.addEventListener("click", () => {
  if (currentUser) {
    openMinSide();
  } else {
    openAuthModal("login");
  }
});

// Open / Close Auth Modal
function openAuthModal(tab = "login") {
  authModal.style.display = "flex";
  if (tab === "login") {
    tabLoginBtn.classList.add("active");
    tabRegisterBtn.classList.remove("active");
    authLoginPane.style.display = "block";
    authRegisterPane.style.display = "none";
  } else {
    tabRegisterBtn.classList.add("active");
    tabLoginBtn.classList.remove("active");
    authRegisterPane.style.display = "block";
    authLoginPane.style.display = "none";
  }
}

function closeAuthModal() {
  authModal.style.display = "none";
  loginErrorMsg.style.display = "none";
  regErrorMsg.style.display = "none";
}

if (btnCloseAuth) btnCloseAuth.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (e) => { if (e.target === authModal) closeAuthModal(); });

tabLoginBtn.addEventListener("click", () => {
  tabLoginBtn.classList.add("active");
  tabRegisterBtn.classList.remove("active");
  authLoginPane.style.display = "block";
  authRegisterPane.style.display = "none";
});

tabRegisterBtn.addEventListener("click", () => {
  tabRegisterBtn.classList.add("active");
  tabLoginBtn.classList.remove("active");
  authRegisterPane.style.display = "block";
  authLoginPane.style.display = "none";
});

// Demo Account Chips Click
if (chipDemoOle) {
  chipDemoOle.addEventListener("click", () => {
    loginEmail.value = "ole.hansen@example.no";
    loginPassword.value = "pass123";
    loginErrorMsg.style.display = "none";
  });
}
if (chipDemoKari) {
  chipDemoKari.addEventListener("click", () => {
    loginEmail.value = "kari.nordmann@example.no";
    loginPassword.value = "pass123";
    loginErrorMsg.style.display = "none";
  });
}

// Login Submit
btnSubmitLogin.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  
  if (!email || !password) {
    loginErrorMsg.textContent = "Vennligst oppgi både e-post og passord.";
    loginErrorMsg.style.display = "block";
    return;
  }
  
  btnSubmitLogin.disabled = true;
  btnSubmitLogin.textContent = "Logger inn...";
  
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Feil e-post eller passord.");
    
    currentUser = data.user;
    localStorage.setItem("servida_customer_user", JSON.stringify(currentUser));
    updateNavAuthDisplay();
    closeAuthModal();
    openMinSide();
  } catch (err) {
    loginErrorMsg.textContent = err.message;
    loginErrorMsg.style.display = "block";
  } finally {
    btnSubmitLogin.disabled = false;
    btnSubmitLogin.textContent = "Logg inn på Min Side";
  }
});

// Register Submit
btnSubmitRegister.addEventListener("click", async () => {
  const full_name = regName.value.trim();
  const email = regEmail.value.trim();
  const phone = regPhone.value.trim();
  const street_address = regAddress.value.trim();
  const postal_code = regPostcode.value.trim();
  const city = regCity.value.trim();
  const password = regPassword.value.trim();
  
  if (!full_name || !email || !phone || !street_address || !postal_code || !city || !password) {
    regErrorMsg.textContent = "Vennligst fyll ut alle feltene.";
    regErrorMsg.style.display = "block";
    return;
  }
  
  btnSubmitRegister.disabled = true;
  btnSubmitRegister.textContent = "Oppretter konto...";
  
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, email, phone, street_address, postal_code, city, password })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Kunne ikke opprette konto.");
    
    currentUser = data.user;
    localStorage.setItem("servida_customer_user", JSON.stringify(currentUser));
    updateNavAuthDisplay();
    closeAuthModal();
    openMinSide();
  } catch (err) {
    regErrorMsg.textContent = err.message;
    regErrorMsg.style.display = "block";
  } finally {
    btnSubmitRegister.disabled = false;
    btnSubmitRegister.textContent = "Opprett konto & Logg inn";
  }
});

// Open / Close Min Side Modal
async function openMinSide() {
  if (!currentUser) return;
  
  minsideUserName.textContent = currentUser.full_name;
  minsideUserEmail.textContent = currentUser.email;
  minsideModal.style.display = "flex";
  
  // Fill Profile Form
  profName.value = currentUser.full_name || "";
  profEmail.value = currentUser.email || "";
  profPhone.value = currentUser.phone || "";
  profAddress.value = currentUser.street_address || "";
  profPostcode.value = currentUser.postal_code || "";
  profCity.value = currentUser.city || "";
  profNewPassword.value = "";
  profileSuccessMsg.style.display = "none";
  
  await loadCustomerOrders();
}

function closeMinSide() {
  minsideModal.style.display = "none";
}

if (btnCloseMinside) btnCloseMinside.addEventListener("click", closeMinSide);
minsideModal.addEventListener("click", (e) => { if (e.target === minsideModal) closeMinSide(); });

// Min Side Tabs Switcher
minsideTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    minsideTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    
    const target = tab.dataset.tab;
    if (target === "orders") {
      paneMinsideOrders.style.display = "block";
      paneMinsideProfile.style.display = "none";
    } else {
      paneMinsideOrders.style.display = "none";
      paneMinsideProfile.style.display = "block";
    }
  });
});

// Logout
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    currentUser = null;
    localStorage.removeItem("servida_customer_user");
    updateNavAuthDisplay();
    closeMinSide();
  });
}

if (btnNewBookingFromPortal) {
  btnNewBookingFromPortal.addEventListener("click", () => {
    closeMinSide();
    document.getElementById("catalog-section").scrollIntoView({ behavior: "smooth" });
  });
}

// Load Customer Orders
async function loadCustomerOrders() {
  if (!currentUser) return;
  minsideOrdersList.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748B;">Laster dine bestillinger...</div>`;
  
  try {
    const res = await fetch(`/api/user/orders/${currentUser.id}`);
    const data = await res.json();
    const orders = data.orders || [];
    
    minsideOrdersCount.textContent = orders.length;
    
    if (orders.length === 0) {
      minsideOrdersList.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; background: #F8FAFC; border: 1px dashed var(--color-border); border-radius: 12px;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">📋</span>
          <h4 style="font-weight: 700; margin-bottom: 0.25rem;">Ingen bestillinger enda</h4>
          <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 1rem;">
            Når du bestiller håndverkertjenester, vil du se live fremdrift og kvitteringer her.
          </p>
          <button class="btn-primary-sm" onclick="closeMinSide(); document.getElementById('catalog-section').scrollIntoView({behavior: 'smooth'});">
            Utforsk tjenester
          </button>
        </div>
      `;
      return;
    }
    
    minsideOrdersList.innerHTML = orders.map(o => {
      let badgeClass = "badge-status-ny";
      if (o.status === "Bekreftet") badgeClass = "badge-status-bekreftet";
      if (o.status === "Håndverker tildelt") badgeClass = "badge-status-tildelt";
      if (o.status === "På vei") badgeClass = "badge-status-pavei";
      if (o.status === "Pågår") badgeClass = "badge-status-pagar";
      if (o.status === "Utført") badgeClass = "badge-status-utført";
      if (o.status === "Fakturert") badgeClass = "badge-status-fakturert";
      if (o.status === "Kansellert") badgeClass = "badge-status-kansellert";
      
      return `
        <div class="customer-order-card" onclick="openTrackingModal('${o.order_number}')">
          <div class="order-card-header">
            <div>
              <span style="font-family: monospace; font-weight: 800; font-size: 0.88rem; color: var(--color-primary);">${o.order_number}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-muted); margin-left: 0.5rem;">${o.created_at ? o.created_at.split(' ')[0] : ''}</span>
            </div>
            <span class="order-status-badge ${badgeClass}">${o.status}</span>
          </div>
          
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0.25rem 0 0.4rem;">${o.service_title}</h4>
          
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--color-text-muted); flex-wrap: wrap; gap: 0.5rem;">
            <div>📅 <strong>${o.preferred_date}</strong> (${o.time_slot}) &nbsp;|&nbsp; 📍 ${o.street_address}, ${o.postal_code} ${o.city}</div>
            <div style="font-weight: 800; font-size: 1rem; color: var(--color-primary);">kr ${Math.round(o.total_price).toLocaleString('no-NO')},-</div>
          </div>
          
          <div style="margin-top: 0.75rem; padding-top: 0.6rem; border-top: 1px dashed var(--color-border); display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
            <span>👷 <strong>${o.assigned_handyman || 'Tildeles snart'}</strong></span>
            <span style="color: var(--color-accent); font-weight: 700;">Se live status & dialog →</span>
          </div>
        </div>
      `;
    }).join("");
    
  } catch (err) {
    minsideOrdersList.innerHTML = `<div style="color: #DC2626;">Kunne ikke laste bestillinger: ${err.message}</div>`;
  }
}

// Save Profile Updates
btnSaveProfile.addEventListener("click", async () => {
  if (!currentUser) return;
  
  const full_name = profName.value.trim();
  const phone = profPhone.value.trim();
  const street_address = profAddress.value.trim();
  const postal_code = profPostcode.value.trim();
  const city = profCity.value.trim();
  const new_password = profNewPassword.value.trim();
  
  btnSaveProfile.disabled = true;
  btnSaveProfile.textContent = "Lagrer...";
  
  try {
    const res = await fetch(`/api/user/profile/${currentUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, phone, street_address, postal_code, city, new_password })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Kunne ikke lagre profil.");
    
    currentUser = data.user;
    localStorage.setItem("servida_customer_user", JSON.stringify(currentUser));
    updateNavAuthDisplay();
    
    profileSuccessMsg.textContent = "✓ Profilendringer er lagret!";
    profileSuccessMsg.style.display = "block";
  } catch (err) {
    alert("Feil ved lagring: " + err.message);
  } finally {
    btnSaveProfile.disabled = false;
    btnSaveProfile.textContent = "Lagre profilendringer";
  }
});

// ==========================================================================
// ORDER DETAILS & LIVE TRACKING MODAL LOGIC
// ==========================================================================

async function openTrackingModal(orderNumberOrId) {
  try {
    const res = await fetch(`/api/orders/${orderNumberOrId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Ordre ikke funnet");
    
    currentTrackingOrder = data.order;
    renderTrackingModal(currentTrackingOrder);
    orderDetailModal.style.display = "flex";
    
    // Start polling messages
    if (trackingMsgPoll) clearInterval(trackingMsgPoll);
    trackingMsgPoll = setInterval(refreshTrackingMessages, 5000);
  } catch (err) {
    alert("Kunne ikke åpne ordren: " + err.message);
  }
}

function closeTrackingModal() {
  orderDetailModal.style.display = "none";
  if (trackingMsgPoll) clearInterval(trackingMsgPoll);
}

if (btnCloseTracking) btnCloseTracking.addEventListener("click", closeTrackingModal);
orderDetailModal.addEventListener("click", (e) => { if (e.target === orderDetailModal) closeTrackingModal(); });

function renderTrackingModal(order) {
  trackServiceTitle.textContent = order.service_title;
  trackOrderNum.textContent = `Ordrenr: ${order.order_number}`;
  trackStatusPill.textContent = order.status;
  
  // Status Pill Class
  let badgeClass = "badge-status-ny";
  if (order.status === "Bekreftet") badgeClass = "badge-status-bekreftet";
  if (order.status === "Håndverker tildelt") badgeClass = "badge-status-tildelt";
  if (order.status === "På vei") badgeClass = "badge-status-pavei";
  if (order.status === "Pågår") badgeClass = "badge-status-pagar";
  if (order.status === "Utført") badgeClass = "badge-status-utført";
  if (order.status === "Fakturert") badgeClass = "badge-status-fakturert";
  if (order.status === "Kansellert") badgeClass = "badge-status-kansellert";
  trackStatusPill.className = `order-status-badge ${badgeClass}`;

  // Visual Pipeline Stages
  const stages = [
    { key: "Mottatt", label: "1. Mottatt" },
    { key: "Bekreftet", label: "2. Bekreftet" },
    { key: "Håndverker", label: "3. Tildelt / På vei" },
    { key: "Pågår", label: "4. Arbeid pågår" },
    { key: "Utført", label: "5. Fullført" }
  ];

  let currentStageIdx = 0;
  if (order.status === "Ny bestilling") currentStageIdx = 0;
  else if (order.status === "Bekreftet") currentStageIdx = 1;
  else if (order.status === "Håndverker tildelt" || order.status === "På vei") currentStageIdx = 2;
  else if (order.status === "Pågår") currentStageIdx = 3;
  else if (order.status === "Utført" || order.status === "Fakturert") currentStageIdx = 4;

  trackProgressSteps.innerHTML = stages.map((s, idx) => {
    let stateClass = "";
    if (idx < currentStageIdx) stateClass = "completed";
    else if (idx === currentStageIdx) stateClass = "active";
    
    return `
      <div class="ptrack-step ${stateClass}">
        <div class="ptrack-dot">${idx < currentStageIdx ? "✓" : idx + 1}</div>
        <span class="ptrack-label">${s.label}</span>
      </div>
    `;
  }).join("");

  // Handyman Info
  trackHandymanName.textContent = order.assigned_handyman || "Tildeles innen kort tid";
  trackHandymanStatusNote.textContent = order.handyman_notes || "Fagperson sjekker oppdragsdetaljer.";

  // Info Grid
  trackDatetime.textContent = `${order.preferred_date} (${order.time_slot})`;
  trackAddress.textContent = `${order.street_address}, ${order.postal_code} ${order.city}`;
  trackVariant.textContent = order.variant_name || "Standard fastpris";
  trackTotalPrice.textContent = `kr ${Math.round(order.total_price).toLocaleString('no-NO')},-`;
  trackPaymentBadge.textContent = order.payment_status ? `Betalingsstatus: ${order.payment_status}` : "Betales etter godkjenning";

  // Render Messages
  renderTrackingMessagesList(order.messages || []);

  // Review Box (show if completed and not reviewed yet)
  if ((order.status === "Utført" || order.status === "Fakturert") && !order.rating) {
    trackReviewBox.style.display = "block";
  } else {
    trackReviewBox.style.display = "none";
  }

  // Cancel Button visibility
  if (order.status === "På vei" || order.status === "Pågår" || order.status === "Utført" || order.status === "Fakturert" || order.status === "Kansellert") {
    btnCancelOrderTrack.style.display = "none";
  } else {
    btnCancelOrderTrack.style.display = "inline-block";
  }
}

function renderTrackingMessagesList(messages) {
  if (!messages || messages.length === 0) {
    trackChatMessages.innerHTML = `<div style="font-size: 0.8rem; color: #64748B; font-style: italic;">Ingen beskjeder enda. Skriv under hvis du har instrukser om adkomst etc.</div>`;
    return;
  }

  trackChatMessages.innerHTML = messages.map(m => {
    const isCustomer = m.sender_role === "customer";
    return `
      <div class="chat-msg-bubble ${isCustomer ? 'from-customer' : 'from-staff'}">
        <div style="font-size: 0.7rem; opacity: 0.75; font-weight: 700; margin-bottom: 0.2rem;">
          ${m.sender_name} (${m.created_at ? m.created_at.split(' ')[1] : ''})
        </div>
        <div>${m.message}</div>
      </div>
    `;
  }).join("");

  trackChatMessages.scrollTop = trackChatMessages.scrollHeight;
}

async function refreshTrackingMessages() {
  if (!currentTrackingOrder) return;
  try {
    const res = await fetch(`/api/orders/${currentTrackingOrder.id}/messages`);
    const data = await res.json();
    renderTrackingMessagesList(data.messages || []);
  } catch (err) {
    console.error(err);
  }
}

// Send Chat Message
btnSendChatMsg.addEventListener("click", async () => {
  if (!currentTrackingOrder) return;
  const message = chatNewMessageInput.value.trim();
  if (!message) return;

  const sender_name = currentUser ? currentUser.full_name : (currentTrackingOrder.customer_name || "Kunde");
  const sender_id = currentUser ? currentUser.id : null;

  chatNewMessageInput.value = "";
  try {
    await fetch(`/api/orders/${currentTrackingOrder.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sender_name, sender_role: "customer", sender_id })
    });
    refreshTrackingMessages();
  } catch (err) {
    alert("Kunne ikke sende melding: " + err.message);
  }
});

// Star Rating Picker
starRatingPicker.querySelectorAll(".star-pick").forEach(star => {
  star.addEventListener("click", () => {
    selectedReviewRating = parseInt(star.dataset.val);
    starRatingPicker.querySelectorAll(".star-pick").forEach(s => {
      s.classList.toggle("active", parseInt(s.dataset.val) <= selectedReviewRating);
    });
  });
});

// Submit Review
btnSubmitReview.addEventListener("click", async () => {
  if (!currentTrackingOrder) return;
  const review_comment = reviewCommentInput.value.trim();
  
  try {
    await fetch(`/api/orders/${currentTrackingOrder.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: selectedReviewRating, review_comment })
    });
    alert("Tusen takk for din tilbakemelding!");
    trackReviewBox.style.display = "none";
  } catch (err) {
    alert("Kunne ikke sende vurdering: " + err.message);
  }
});

// Cancel Order
btnCancelOrderTrack.addEventListener("click", async () => {
  if (!currentTrackingOrder) return;
  if (!confirm("Er du sikker på at du vil avbestille dette oppdraget?")) return;

  try {
    const res = await fetch(`/api/orders/${currentTrackingOrder.id}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Kunne ikke avbestille.");
    
    alert("Bestillingen er avbestilt.");
    openTrackingModal(currentTrackingOrder.id);
    if (currentUser) loadCustomerOrders();
  } catch (err) {
    alert(err.message);
  }
});

// Print Receipt
btnPrintReceipt.addEventListener("click", () => {
  window.print();
});

// Quick Track Nav Button
btnTrackOrderNav.addEventListener("click", () => {
  quickTrackModal.style.display = "flex";
  quickTrackInput.value = "";
  quickTrackError.style.display = "none";
});

if (btnCloseQuickTrack) btnCloseQuickTrack.addEventListener("click", () => { quickTrackModal.style.display = "none"; });
quickTrackModal.addEventListener("click", (e) => { if (e.target === quickTrackModal) quickTrackModal.style.display = "none"; });

btnSubmitQuickTrack.addEventListener("click", () => {
  const code = quickTrackInput.value.trim();
  if (!code) {
    quickTrackError.textContent = "Vennligst tast inn et ordrenummer.";
    quickTrackError.style.display = "block";
    return;
  }
  quickTrackModal.style.display = "none";
  openTrackingModal(code);
});

// Auto-fill booking form if logged in
const origOpenServiceModal = openServiceModal;
openServiceModal = function(service) {
  origOpenServiceModal(service);
  if (currentUser) {
    inpName.value = currentUser.full_name || "";
    inpEmail.value = currentUser.email || "";
    inpPhone.value = currentUser.phone || "";
    inpStreet.value = currentUser.street_address || "";
    inpPostcode.value = currentUser.postal_code || "";
    inpCity.value = currentUser.city || "";
  }
};

// ==========================================================================
// GEMINI AI CHATBOT CONTROLLER (STOREFRONT)
// ==========================================================================

const aiFabBtn = document.getElementById("ai-fab-btn");
const aiChatWindow = document.getElementById("ai-chat-window");
const btnCloseAiChat = document.getElementById("btn-close-ai-chat");
const aiMessagesFeed = document.getElementById("ai-messages-feed");
const aiUserInput = document.getElementById("ai-user-input");
const btnAiSend = document.getElementById("btn-ai-send");
const aiChips = document.querySelectorAll(".ai-chip");

let aiChatHistory = [];
let isAiTyping = false;

if (aiFabBtn && aiChatWindow) {
  aiFabBtn.addEventListener("click", () => {
    const isHidden = aiChatWindow.style.display === "none" || !aiChatWindow.style.display;
    aiChatWindow.style.display = isHidden ? "flex" : "none";
    if (isHidden) {
      setTimeout(() => aiUserInput.focus(), 150);
    }
  });

  if (btnCloseAiChat) {
    btnCloseAiChat.addEventListener("click", () => {
      aiChatWindow.style.display = "none";
    });
  }

  // Quick Chips Click
  aiChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const query = chip.dataset.query;
      if (query) sendCustomerAiMessage(query);
    });
  });

  // Send on button click or Enter key
  btnAiSend.addEventListener("click", () => {
    const text = aiUserInput.value.trim();
    if (text) sendCustomerAiMessage(text);
  });

  aiUserInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = aiUserInput.value.trim();
      if (text) sendCustomerAiMessage(text);
    }
  });
}

async function sendCustomerAiMessage(userText) {
  if (isAiTyping || !userText) return;

  // Append user bubble
  appendAiBubble(userText, "user");
  aiUserInput.value = "";
  isAiTyping = true;
  btnAiSend.disabled = true;

  // Append typing indicator
  const typingElem = document.createElement("div");
  typingElem.className = "ai-msg ai-msg-bot";
  typingElem.id = "ai-typing-indicator";
  typingElem.innerHTML = `
    <div class="ai-bubble" style="display: flex; gap: 4px; align-items: center; padding: 0.6rem 0.85rem;">
      <span style="font-size: 0.78rem; color: #64748B;">Servida AI tenker...</span>
      <span class="ai-online-pulse" style="width: 6px; height: 6px;"></span>
    </div>
  `;
  aiMessagesFeed.appendChild(typingElem);
  aiMessagesFeed.scrollTop = aiMessagesFeed.scrollHeight;

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        history: aiChatHistory
      })
    });

    const data = await res.json();
    const typingInd = document.getElementById("ai-typing-indicator");
    if (typingInd) typingInd.remove();

    const botReply = data.reply || "Jeg mottok henvendelsen din. Hva mer kan jeg hjelpe deg med?";
    const recommendedServices = data.recommended_services || [];

    // Append bot bubble
    appendAiBubble(botReply, "bot", recommendedServices);

    // Save in history
    aiChatHistory.push({ role: "user", text: userText });
    aiChatHistory.push({ role: "model", text: botReply });
    if (aiChatHistory.length > 8) aiChatHistory = aiChatHistory.slice(-8);

  } catch (err) {
    const typingInd = document.getElementById("ai-typing-indicator");
    if (typingInd) typingInd.remove();
    appendAiBubble("Beklager, jeg hadde problemer med å kontakte serveren akkurat nå. Vennligst prøv igjen om et øyeblikk.", "bot");
  } finally {
    isAiTyping = false;
    btnAiSend.disabled = false;
  }
}

function appendAiBubble(text, sender, recommendedServices = []) {
  const msgWrap = document.createElement("div");
  msgWrap.className = `ai-msg ai-msg-${sender}`;

  let recsHtml = "";
  if (recommendedServices && recommendedServices.length > 0) {
    recsHtml = `
      <div class="ai-service-recs">
        <div style="font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">Foreslåtte fastpristjenester:</div>
        ${recommendedServices.map(s => `
          <div class="ai-rec-card" onclick="openServiceByHandle('${s.handle}')">
            <div class="ai-rec-info">
              <strong>${s.title}</strong>
              <span>Fastpris fra kr ${Math.round(s.price_from).toLocaleString('no-NO')},-</span>
            </div>
            <button class="btn-primary-sm" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; pointer-events: none;">Bestill →</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  // Format basic bold and linebreaks
  const formattedText = text
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  msgWrap.innerHTML = `
    <div class="ai-bubble">
      <div>${formattedText}</div>
      ${recsHtml}
    </div>
  `;

  aiMessagesFeed.appendChild(msgWrap);
  aiMessagesFeed.scrollTop = aiMessagesFeed.scrollHeight;
}

// Helper to trigger booking modal by handle from chat
function openServiceByHandle(handle) {
  const s = allServices.find(x => x.handle === handle);
  if (s) {
    openServiceModal(s);
  }
}


