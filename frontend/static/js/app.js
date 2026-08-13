/**
 * SERVIDA STOREFRONT ENGINE
 * Fast, reactive service catalog, dynamic price calculator, linkable service pages, and frictionless booking.
 */

// ==========================================================================
// 1. STATE & GLOBAL VARIABLES
// ==========================================================================
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

let currentUser = JSON.parse(localStorage.getItem('servida_customer_user')) || null;
let currentTrackingOrder = null;
let trackingMsgPoll = null;
let selectedReviewRating = 5;

// ==========================================================================
// 2. DOM ELEMENTS
// ==========================================================================
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

// Service Modal Elements
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

// Demo Account Chips
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

// AI Chatbot Elements
const aiFabBtn = document.getElementById("ai-fab-btn");
const aiChatWindow = document.getElementById("ai-chat-window");
const btnCloseAiChat = document.getElementById("btn-close-ai-chat");
const aiMessagesFeed = document.getElementById("ai-messages-feed");
const aiUserInput = document.getElementById("ai-user-input");
const btnAiSend = document.getElementById("btn-ai-send");
const aiChips = document.querySelectorAll(".ai-chip");

let aiChatHistory = [];
let isAiTyping = false;

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

// ==========================================================================
// 3. CATALOG & STOREFRONT LOGIC
// ==========================================================================

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
    checkUrlServiceRoute();
  } catch (err) {
    console.error(err);
    if (servicesCountDisplay) {
      servicesCountDisplay.textContent = "Feil ved innlasting av tjenester. Vennligst prøv igjen.";
    }
  }
}

function renderCategoryPills() {
  if (!categoryPillsContainer) return;
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
      btn.innerHTML = `<span>${cat.icon || '🛠️'}</span> ${cat.name} (${count})`;
      btn.addEventListener("click", () => setCategory(cat.name));
      categoryPillsContainer.appendChild(btn);
    }
  });
  
  const allBtn = categoryPillsContainer.querySelector('[data-category="all"]');
  if (allBtn) {
    allBtn.addEventListener("click", () => setCategory("all"));
  }
}

function setCategory(catName) {
  activeCategory = catName;
  document.querySelectorAll(".category-pill-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.category === catName);
  });
  
  if (currentCategoryHeading) {
    currentCategoryHeading.textContent = catName === "all" ? "Alle håndverkertjenester" : catName;
  }
  renderServices();
}

function getFilteredServices() {
  let filtered = [...allServices];
  
  if (activeCategory !== "all") {
    filtered = filtered.filter(s => s.category === activeCategory);
  }
  
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase().trim();
    filtered = filtered.filter(s => 
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.short_description && s.short_description.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q))
    );
  }
  
  if (currentSort === "price-low") {
    filtered.sort((a, b) => a.price_from - b.price_from);
  } else if (currentSort === "price-high") {
    filtered.sort((a, b) => b.price_from - a.price_from);
  } else if (currentSort === "title-asc") {
    filtered.sort((a, b) => a.title.localeCompare(b.title, "no"));
  }
  
  return filtered;
}

function renderServices() {
  if (!servicesGrid) return;
  const list = getFilteredServices();
  
  if (servicesCountDisplay) {
    servicesCountDisplay.textContent = `${list.length} ${list.length === 1 ? "tjeneste" : "tjenester"} tilgjengelig med fastpris`;
  }
  
  if (list.length === 0) {
    servicesGrid.innerHTML = "";
    if (noResultsState) noResultsState.style.display = "block";
    return;
  }
  
  if (noResultsState) noResultsState.style.display = "none";
  servicesGrid.innerHTML = "";
  
  list.forEach(s => {
    const card = document.createElement("article");
    card.className = "service-card";
    card.tabIndex = 0;
    card.dataset.handle = s.handle;
    
    const imgUrl = s.image_url || (s.images && s.images[0]) || "/static/images/hero-handyman.jpg";
    const warrantyText = s.warranty || "2 års garanti";
    
    card.innerHTML = `
      <div class="service-card-img-wrap">
        <img src="${imgUrl}" alt="${s.title}" class="service-card-img" loading="lazy" onerror="this.src='/static/images/hero-handyman.jpg'">
        <div class="service-warranty-badge">🛡️ ${warrantyText}</div>
        <div class="service-category-tag">${s.category}</div>
      </div>
      <div class="service-card-body">
        <h3 class="service-card-title">${s.title}</h3>
        <p class="service-card-desc">${s.short_description || ''}</p>
        <div class="service-card-footer">
          <div class="service-price-block">
            <span class="price-label">Fastpris fra</span>
            <span class="price-value">${formatNOK(s.price_from)}</span>
          </div>
          <button class="btn-book-sm" type="button">Reserver tid</button>
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

// Check URL Route / Deep Link to Specific Service
function checkUrlServiceRoute() {
  const hash = window.location.hash;
  if (hash && hash.startsWith("#tjeneste/")) {
    const handle = hash.replace("#tjeneste/", "");
    const s = allServices.find(x => x.handle === handle);
    if (s) openServiceModal(s);
  }
  const params = new URLSearchParams(window.location.search);
  const sHandle = params.get("tjeneste");
  if (sHandle) {
    const s = allServices.find(x => x.handle === sHandle);
    if (s) openServiceModal(s);
  }
}

window.addEventListener("hashchange", checkUrlServiceRoute);

// ==========================================================================
// 4. SERVICE DETAIL & BOOKING MODAL
// ==========================================================================

function openServiceModal(service) {
  if (!service || !serviceModal) return;
  activeService = service;
  currentStep = 1;
  selectedAddons = [];
  
  // Linkable URL state
  if (window.location.hash !== `#tjeneste/${service.handle}`) {
    window.location.hash = `tjeneste/${service.handle}`;
  }
  
  // Setup header
  if (modalImg) {
    modalImg.src = service.image_url || (service.images && service.images[0]) || "/static/images/hero-handyman.jpg";
    modalImg.alt = service.title;
    modalImg.onerror = function() { this.src = '/static/images/hero-handyman.jpg'; };
  }
  if (modalTitle) modalTitle.textContent = service.title;
  if (modalDesc) modalDesc.textContent = service.description || service.short_description || "";
  if (modalWarranty) modalWarranty.textContent = `🛡️ ${service.warranty || "2 års garanti"}`;
  if (modalTime) modalTime.textContent = `⏱️ ${service.estimated_hours || "1–3 timer"}`;
  if (modalCategory) modalCategory.textContent = service.category;
  
  // Auto-fill customer info if logged in
  if (currentUser) {
    if (inpName) inpName.value = currentUser.full_name || "";
    if (inpEmail) inpEmail.value = currentUser.email || "";
    if (inpPhone) inpPhone.value = currentUser.phone || "";
    if (inpStreet) inpStreet.value = currentUser.street_address || "";
    if (inpPostcode) inpPostcode.value = currentUser.postal_code || "";
    if (inpCity) inpCity.value = currentUser.city || "";
  }
  
  // Populate variants
  if (modalVariantsContainer) {
    modalVariantsContainer.innerHTML = "";
    const variants = service.variants && service.variants.length > 0 
      ? service.variants 
      : [
          { name: "Standard utførelse", price: service.price_from },
          { name: "Komplett pakke (inkl. klargjøring & finjustering)", price: Math.round(service.price_from * 1.35) }
        ];
      
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
  }
  
  // Populate Add-ons
  if (modalAddonsContainer) {
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
  }
  
  // Populate Included List
  if (modalIncludedList) {
    modalIncludedList.innerHTML = "";
    let includedItems = Array.isArray(service.included) ? service.included : (service.included ? [service.included] : []);
    if (includedItems.length === 0) {
      includedItems = [
        `Fagmessig utførelse av ${service.title.toLowerCase()}`,
        "Oppmøte og kjøring i dekningsområdet inkludert",
        "Nødvendig standard håndverkerverktøy og forbruksmateriell",
        "Opprydding og feiing av arbeidsområdet etter fullført arbeid",
        "100 % fastprisgaranti og 2 års garanti på utført arbeid"
      ];
    }
    includedItems.forEach(inc => {
      if (inc && inc.trim()) {
        const li = document.createElement("li");
        li.textContent = inc.trim();
        modalIncludedList.appendChild(li);
      }
    });
  }
  
  updateLiveTotal();
  setModalStep(1);
  
  // Open modal
  serviceModal.classList.add("active");
  serviceModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function updateLiveTotal() {
  if (!modalLiveTotal) return;
  let total = selectedVariant ? selectedVariant.price : (activeService ? activeService.price_from : 0);
  selectedAddons.forEach(a => { total += a.price; });
  modalLiveTotal.textContent = formatNOK(total);
}

function calculateCurrentTotal() {
  let total = selectedVariant ? selectedVariant.price : (activeService ? activeService.price_from : 0);
  selectedAddons.forEach(a => { total += a.price; });
  return total;
}

// Stepper navigation
function setModalStep(step) {
  currentStep = step;
  
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
  
  if (!modalFooterBar || !btnModalNext || !btnModalBack) return;

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
    modalFooterBar.style.display = "none";
  }
}

if (btnModalNext) {
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
}

if (btnModalBack) {
  btnModalBack.addEventListener("click", () => {
    if (currentStep > 1) setModalStep(currentStep - 1);
  });
}

async function submitBooking() {
  if (!btnModalNext) return;
  btnModalNext.disabled = true;
  btnModalNext.textContent = "Sender bestilling...";
  
  const payload = {
    service_handle: activeService.handle,
    service_title: activeService.title,
    variant_name: selectedVariant ? selectedVariant.name : "Standard",
    addons: selectedAddons,
    total_price: calculateCurrentTotal(),
    street_address: inpStreet.value.trim(),
    postal_code: inpPostcode.value.trim(),
    city: inpCity.value.trim(),
    preferred_date: inpDate.value,
    time_slot: selectedTimeSlot,
    customer_name: inpName.value.trim(),
    customer_phone: inpPhone.value.trim(),
    customer_email: inpEmail.value.trim(),
    notes: inpNotes ? inpNotes.value.trim() : "",
    user_id: currentUser ? currentUser.id : null
  };
  
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Bestillingen kunne ikke fullføres.");
    }
    
    const result = await res.json();
    
    if (confOrderNum) confOrderNum.textContent = `Ordrenr: ${result.order_number}`;
    if (confServiceTitle) confServiceTitle.textContent = `${result.order.service_title} (${result.order.variant_name})`;
    if (confDatetime) confDatetime.textContent = `${result.order.preferred_date} (${result.order.time_slot})`;
    if (confAddress) confAddress.textContent = `${result.order.street_address}, ${result.order.postal_code} ${result.order.city}`;
    if (confTotalPrice) confTotalPrice.textContent = formatNOK(result.order.total_price);
    
    setModalStep(4);
    
    // Auto-refresh order count if customer logged in
    if (currentUser) loadCustomerOrders();
    
  } catch (err) {
    alert("Feil ved bestilling: " + err.message);
  } finally {
    btnModalNext.disabled = false;
  }
}

function closeModal() {
  if (!serviceModal) return;
  serviceModal.classList.remove("active");
  serviceModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (window.location.hash && window.location.hash.startsWith("#tjeneste/")) {
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
}

if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
if (btnCloseSuccess) btnCloseSuccess.addEventListener("click", closeModal);
if (serviceModal) {
  serviceModal.addEventListener("click", (e) => {
    if (e.target === serviceModal) closeModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && serviceModal && serviceModal.classList.contains("active")) {
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
if (globalSearchInput) {
  globalSearchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value;
    renderServices();
  });
}

if (sortSelect) {
  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    renderServices();
  });
}

if (btnResetFilters) {
  btnResetFilters.addEventListener("click", () => {
    if (globalSearchInput) globalSearchInput.value = "";
    currentSearch = "";
    activeCategory = "all";
    document.querySelectorAll(".category-pill-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.category === "all");
    });
    if (currentCategoryHeading) currentCategoryHeading.textContent = "Alle håndverkertjenester";
    renderServices();
  });
}

// Postcode Checker logic
if (btnCheckPostcode && postcodeCheckInput && postcodeStatusMsg) {
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
    
    if (inpPostcode) inpPostcode.value = code;
  });
}

function initDateDefaults() {
  if (!inpDate) return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  inpDate.value = `${yyyy}-${mm}-${dd}`;
  inpDate.min = `${yyyy}-${mm}-${dd}`;
}

// ==========================================================================
// 5. CUSTOMER AUTHENTICATION & MIN SIDE LOGIC
// ==========================================================================

function updateNavAuthDisplay() {
  if (!btnAccountNav || !navUserLabel) return;
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
if (btnAccountNav) {
  btnAccountNav.addEventListener("click", () => {
    if (currentUser) {
      openMinSide();
    } else {
      openAuthModal("login");
    }
  });
}

function openAuthModal(tab = "login") {
  if (!authModal) return;
  authModal.style.display = "flex";
  if (tab === "login") {
    if (tabLoginBtn) tabLoginBtn.classList.add("active");
    if (tabRegisterBtn) tabRegisterBtn.classList.remove("active");
    if (authLoginPane) authLoginPane.style.display = "block";
    if (authRegisterPane) authRegisterPane.style.display = "none";
  } else {
    if (tabRegisterBtn) tabRegisterBtn.classList.add("active");
    if (tabLoginBtn) tabLoginBtn.classList.remove("active");
    if (authRegisterPane) authRegisterPane.style.display = "block";
    if (authLoginPane) authLoginPane.style.display = "none";
  }
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.style.display = "none";
  if (loginErrorMsg) loginErrorMsg.style.display = "none";
  if (regErrorMsg) regErrorMsg.style.display = "none";
}

if (btnCloseAuth) btnCloseAuth.addEventListener("click", closeAuthModal);
if (authModal) {
  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) closeAuthModal();
  });
}

if (tabLoginBtn) {
  tabLoginBtn.addEventListener("click", () => {
    tabLoginBtn.classList.add("active");
    if (tabRegisterBtn) tabRegisterBtn.classList.remove("active");
    if (authLoginPane) authLoginPane.style.display = "block";
    if (authRegisterPane) authRegisterPane.style.display = "none";
  });
}

if (tabRegisterBtn) {
  tabRegisterBtn.addEventListener("click", () => {
    tabRegisterBtn.classList.add("active");
    if (tabLoginBtn) tabLoginBtn.classList.remove("active");
    if (authRegisterPane) authRegisterPane.style.display = "block";
    if (authLoginPane) authLoginPane.style.display = "none";
  });
}

// Demo Account Chips Click
if (chipDemoOle) {
  chipDemoOle.addEventListener("click", () => {
    if (loginEmail) loginEmail.value = "ole.hansen@example.no";
    if (loginPassword) loginPassword.value = "pass123";
    if (loginErrorMsg) loginErrorMsg.style.display = "none";
  });
}
if (chipDemoKari) {
  chipDemoKari.addEventListener("click", () => {
    if (loginEmail) loginEmail.value = "kari.nordmann@example.no";
    if (loginPassword) loginPassword.value = "pass123";
    if (loginErrorMsg) loginErrorMsg.style.display = "none";
  });
}

// Login Submit Handler
async function handleLoginSubmit() {
  if (!loginEmail || !loginPassword || !btnSubmitLogin) return;
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  
  if (!email || !password) {
    if (loginErrorMsg) {
      loginErrorMsg.textContent = "Vennligst oppgi både e-post og passord.";
      loginErrorMsg.style.display = "block";
    }
    return;
  }
  
  btnSubmitLogin.disabled = true;
  btnSubmitLogin.textContent = "Logger inn...";
  if (loginErrorMsg) loginErrorMsg.style.display = "none";
  
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
    if (loginErrorMsg) {
      loginErrorMsg.textContent = err.message;
      loginErrorMsg.style.display = "block";
    }
  } finally {
    btnSubmitLogin.disabled = false;
    btnSubmitLogin.textContent = "Logg inn på Min Side";
  }
}

if (btnSubmitLogin) {
  btnSubmitLogin.addEventListener("click", handleLoginSubmit);
}
if (loginPassword) {
  loginPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLoginSubmit();
  });
}

// Register Submit Handler
async function handleRegisterSubmit() {
  if (!btnSubmitRegister) return;
  const full_name = regName.value.trim();
  const email = regEmail.value.trim();
  const phone = regPhone.value.trim();
  const street_address = regAddress.value.trim();
  const postal_code = regPostcode.value.trim();
  const city = regCity.value.trim();
  const password = regPassword.value.trim();
  
  if (!full_name || !email || !phone || !street_address || !postal_code || !city || !password) {
    if (regErrorMsg) {
      regErrorMsg.textContent = "Vennligst fyll ut alle feltene.";
      regErrorMsg.style.display = "block";
    }
    return;
  }
  
  btnSubmitRegister.disabled = true;
  btnSubmitRegister.textContent = "Oppretter konto...";
  if (regErrorMsg) regErrorMsg.style.display = "none";
  
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
    if (regErrorMsg) {
      regErrorMsg.textContent = err.message;
      regErrorMsg.style.display = "block";
    }
  } finally {
    btnSubmitRegister.disabled = false;
    btnSubmitRegister.textContent = "Opprett konto & Logg inn";
  }
}

if (btnSubmitRegister) {
  btnSubmitRegister.addEventListener("click", handleRegisterSubmit);
}

// Open / Close Min Side Modal
async function openMinSide() {
  if (!currentUser || !minsideModal) return;
  
  if (minsideUserName) minsideUserName.textContent = currentUser.full_name;
  if (minsideUserEmail) minsideUserEmail.textContent = currentUser.email;
  minsideModal.style.display = "flex";
  
  // Fill Profile Form
  if (profName) profName.value = currentUser.full_name || "";
  if (profEmail) profEmail.value = currentUser.email || "";
  if (profPhone) profPhone.value = currentUser.phone || "";
  if (profAddress) profAddress.value = currentUser.street_address || "";
  if (profPostcode) profPostcode.value = currentUser.postal_code || "";
  if (profCity) profCity.value = currentUser.city || "";
  if (profNewPassword) profNewPassword.value = "";
  if (profileSuccessMsg) profileSuccessMsg.style.display = "none";
  
  await loadCustomerOrders();
}

function closeMinSide() {
  if (minsideModal) minsideModal.style.display = "none";
}

if (btnCloseMinside) btnCloseMinside.addEventListener("click", closeMinSide);
if (minsideModal) {
  minsideModal.addEventListener("click", (e) => {
    if (e.target === minsideModal) closeMinSide();
  });
}

// Min Side Tabs Switcher
minsideTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    minsideTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    
    const target = tab.dataset.tab;
    if (target === "orders") {
      if (paneMinsideOrders) paneMinsideOrders.style.display = "block";
      if (paneMinsideProfile) paneMinsideProfile.style.display = "none";
    } else {
      if (paneMinsideOrders) paneMinsideOrders.style.display = "none";
      if (paneMinsideProfile) paneMinsideProfile.style.display = "block";
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
    const catSec = document.getElementById("catalog-section");
    if (catSec) catSec.scrollIntoView({ behavior: "smooth" });
  });
}

// Load Customer Orders
async function loadCustomerOrders() {
  if (!currentUser || !minsideOrdersList) return;
  minsideOrdersList.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748B;">Laster dine bestillinger...</div>`;
  
  try {
    const res = await fetch(`/api/user/orders/${currentUser.id}`);
    const data = await res.json();
    const orders = data.orders || [];
    
    if (minsideOrdersCount) minsideOrdersCount.textContent = orders.length;
    
    if (orders.length === 0) {
      minsideOrdersList.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; background: #F8FAFC; border: 1px dashed var(--color-border); border-radius: 12px;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">📋</span>
          <h4 style="font-weight: 700; margin-bottom: 0.25rem;">Ingen bestillinger enda</h4>
          <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 1rem;">
            Når du bestiller håndverkertjenester, vil du se live fremdrift og kvitteringer her.
          </p>
          <button class="btn-primary-sm" onclick="closeMinSide(); const c=document.getElementById('catalog-section'); if(c) c.scrollIntoView({behavior: 'smooth'});">
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
if (btnSaveProfile) {
  btnSaveProfile.addEventListener("click", async () => {
    if (!currentUser) return;
    
    const full_name = profName.value.trim();
    const phone = profPhone.value.trim();
    const street_address = profAddress.value.trim();
    const postal_code = profPostcode.value.trim();
    const city = profCity.value.trim();
    const new_password = profNewPassword ? profNewPassword.value.trim() : "";
    
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
      
      if (profileSuccessMsg) {
        profileSuccessMsg.textContent = "✓ Profilendringer er lagret!";
        profileSuccessMsg.style.display = "block";
      }
    } catch (err) {
      alert("Feil ved lagring: " + err.message);
    } finally {
      btnSaveProfile.disabled = false;
      btnSaveProfile.textContent = "Lagre profilendringer";
    }
  });
}

// ==========================================================================
// 6. ORDER TRACKING & LIVE CHAT CONTROLLER
// ==========================================================================

async function openTrackingModal(orderNumberOrId) {
  try {
    const res = await fetch(`/api/orders/${orderNumberOrId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Ordre ikke funnet");
    
    currentTrackingOrder = data.order;
    renderTrackingModal(currentTrackingOrder);
    if (orderDetailModal) orderDetailModal.style.display = "flex";
    
    // Start polling messages
    if (trackingMsgPoll) clearInterval(trackingMsgPoll);
    trackingMsgPoll = setInterval(refreshTrackingMessages, 5000);
  } catch (err) {
    alert("Kunne ikke åpne ordren: " + err.message);
  }
}

function closeTrackingModal() {
  if (orderDetailModal) orderDetailModal.style.display = "none";
  if (trackingMsgPoll) clearInterval(trackingMsgPoll);
}

if (btnCloseTracking) btnCloseTracking.addEventListener("click", closeTrackingModal);
if (orderDetailModal) {
  orderDetailModal.addEventListener("click", (e) => {
    if (e.target === orderDetailModal) closeTrackingModal();
  });
}

function renderTrackingModal(order) {
  if (trackServiceTitle) trackServiceTitle.textContent = order.service_title;
  if (trackOrderNum) trackOrderNum.textContent = `Ordrenr: ${order.order_number}`;
  if (trackStatusPill) trackStatusPill.textContent = order.status;
  if (trackDatetime) trackDatetime.textContent = `${order.preferred_date} (${order.time_slot})`;
  if (trackAddress) trackAddress.textContent = `${order.street_address}, ${order.postal_code} ${order.city}`;
  if (trackVariant) trackVariant.textContent = order.variant_name;
  if (trackTotalPrice) trackTotalPrice.textContent = formatNOK(order.total_price);
  
  if (trackPaymentBadge) {
    trackPaymentBadge.textContent = order.payment_status || "Utestående";
    trackPaymentBadge.className = `payment-badge ${order.payment_status === 'Betalt' ? 'paid' : 'pending'}`;
  }
  
  if (trackHandymanName) {
    trackHandymanName.textContent = order.assigned_handyman || "Tildeles i dag";
  }
  if (trackHandymanStatusNote) {
    trackHandymanStatusNote.textContent = order.handyman_notes || "Håndverker har mottatt oppdraget og stiller til avtalt tid.";
  }

  // Update visual timeline steps
  const steps = ["Mottatt", "Bekreftet", "Tildelt", "Pågår", "Utført"];
  const statusMap = {
    "Ny bestilling": 0,
    "Mottatt": 0,
    "Bekreftet": 1,
    "Håndverker tildelt": 2,
    "På vei": 2,
    "Pågår": 3,
    "Utført": 4,
    "Fakturert": 4
  };
  
  const currentIdx = statusMap[order.status] ?? 0;
  
  if (trackProgressSteps) {
    trackProgressSteps.innerHTML = steps.map((s, idx) => {
      let cls = "ptrack-step";
      if (idx < currentIdx) cls += " completed";
      else if (idx === currentIdx) cls += " active";
      
      return `
        <div class="${cls}">
          <div class="ptrack-dot">${idx < currentIdx ? '✓' : (idx + 1)}</div>
          <span class="ptrack-label">${s}</span>
        </div>
      `;
    }).join("");
  }

  // Show review box if order is completed
  if (trackReviewBox) {
    if (order.status === "Utført" || order.status === "Fakturert") {
      trackReviewBox.style.display = "block";
      if (order.customer_rating) {
        setStarRating(order.customer_rating);
        if (reviewCommentInput) reviewCommentInput.value = order.customer_review || "";
        if (btnSubmitReview) {
          btnSubmitReview.disabled = true;
          btnSubmitReview.textContent = "✓ Vurdering levert";
        }
      }
    } else {
      trackReviewBox.style.display = "none";
    }
  }

  refreshTrackingMessages();
}

// Live Chat inside Order Tracking
async function refreshTrackingMessages() {
  if (!currentTrackingOrder || !trackChatMessages) return;
  
  try {
    const res = await fetch(`/api/orders/${currentTrackingOrder.id}/messages`);
    const data = await res.json();
    const messages = data.messages || [];
    
    if (messages.length === 0) {
      trackChatMessages.innerHTML = `<span style="font-size: 0.82rem; color: #94A3B8; font-style: italic;">Ingen meldinger enda. Skriv en beskjed under:</span>`;
      return;
    }
    
    trackChatMessages.innerHTML = messages.map(m => {
      const isCustomer = m.sender_role === "customer";
      return `
        <div class="chat-msg-bubble ${isCustomer ? 'from-customer' : 'from-staff'}">
          <strong style="font-size: 0.72rem; display: block; opacity: 0.8; margin-bottom: 2px;">
            ${m.sender_name} (${m.created_at ? m.created_at.split(' ')[1] : ''})
          </strong>
          <span>${m.message}</span>
        </div>
      `;
    }).join("");
    
    trackChatMessages.scrollTop = trackChatMessages.scrollHeight;
  } catch (err) {
    console.error(err);
  }
}

if (btnSendChatMsg && chatNewMessageInput) {
  btnSendChatMsg.addEventListener("click", async () => {
    if (!currentTrackingOrder) return;
    const msg = chatNewMessageInput.value.trim();
    if (!msg) return;
    
    const sender_name = currentUser ? currentUser.full_name : currentTrackingOrder.customer_name;
    const sender_id = currentUser ? currentUser.id : null;
    
    chatNewMessageInput.value = "";
    
    try {
      await fetch(`/api/orders/${currentTrackingOrder.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          sender_name: sender_name,
          sender_role: "customer",
          sender_id: sender_id
        })
      });
      refreshTrackingMessages();
    } catch (err) {
      alert("Feil ved sending: " + err.message);
    }
  });

  chatNewMessageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      btnSendChatMsg.click();
    }
  });
}

// Star Rating Handling
if (starRatingPicker) {
  document.querySelectorAll(".star-pick").forEach(star => {
    star.addEventListener("click", () => {
      const val = parseInt(star.dataset.val);
      setStarRating(val);
    });
  });
}

function setStarRating(rating) {
  selectedReviewRating = rating;
  document.querySelectorAll(".star-pick").forEach(star => {
    const v = parseInt(star.dataset.val);
    star.classList.toggle("active", v <= rating);
  });
}

// Submit Review
if (btnSubmitReview) {
  btnSubmitReview.addEventListener("click", async () => {
    if (!currentTrackingOrder) return;
    const reviewText = reviewCommentInput ? reviewCommentInput.value.trim() : "";
    
    btnSubmitReview.disabled = true;
    btnSubmitReview.textContent = "Lagrer...";
    
    try {
      const res = await fetch(`/api/orders/${currentTrackingOrder.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: selectedReviewRating,
          review: reviewText
        })
      });
      
      if (!res.ok) throw new Error("Kunne ikke lagre vurdering.");
      
      alert("Tusen takk for din tilbakemelding!");
      btnSubmitReview.textContent = "✓ Vurdering lagret";
    } catch (err) {
      alert(err.message);
      btnSubmitReview.disabled = false;
      btnSubmitReview.textContent = "Send vurdering";
    }
  });
}

// Cancel Order
if (btnCancelOrderTrack) {
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
}

// Print Receipt
if (btnPrintReceipt) {
  btnPrintReceipt.addEventListener("click", () => {
    window.print();
  });
}

// Quick Track Nav Button
if (btnTrackOrderNav && quickTrackModal) {
  btnTrackOrderNav.addEventListener("click", () => {
    quickTrackModal.style.display = "flex";
    if (quickTrackInput) quickTrackInput.value = "";
    if (quickTrackError) quickTrackError.style.display = "none";
  });
}

if (btnCloseQuickTrack && quickTrackModal) {
  btnCloseQuickTrack.addEventListener("click", () => { quickTrackModal.style.display = "none"; });
}
if (quickTrackModal) {
  quickTrackModal.addEventListener("click", (e) => {
    if (e.target === quickTrackModal) quickTrackModal.style.display = "none";
  });
}

if (btnSubmitQuickTrack && quickTrackInput && quickTrackModal) {
  btnSubmitQuickTrack.addEventListener("click", () => {
    const code = quickTrackInput.value.trim();
    if (!code) {
      if (quickTrackError) {
        quickTrackError.textContent = "Vennligst tast inn et ordrenummer.";
        quickTrackError.style.display = "block";
      }
      return;
    }
    quickTrackModal.style.display = "none";
    openTrackingModal(code);
  });
}

// ==========================================================================
// 7. GEMINI AI CHATBOT CONTROLLER (STOREFRONT)
// ==========================================================================

if (aiFabBtn && aiChatWindow) {
  aiFabBtn.addEventListener("click", () => {
    const isHidden = aiChatWindow.style.display === "none" || !aiChatWindow.style.display;
    aiChatWindow.style.display = isHidden ? "flex" : "none";
    if (isHidden && aiUserInput) {
      setTimeout(() => aiUserInput.focus(), 150);
    }
  });

  if (btnCloseAiChat) {
    btnCloseAiChat.addEventListener("click", () => {
      aiChatWindow.style.display = "none";
    });
  }

  aiChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const query = chip.dataset.query;
      if (query) sendCustomerAiMessage(query);
    });
  });

  if (btnAiSend && aiUserInput) {
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
}

async function sendCustomerAiMessage(userText) {
  if (isAiTyping || !userText || !aiMessagesFeed) return;

  appendAiBubble(userText, "user");
  if (aiUserInput) aiUserInput.value = "";
  isAiTyping = true;
  if (btnAiSend) btnAiSend.disabled = true;

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

    appendAiBubble(botReply, "bot", recommendedServices);

    aiChatHistory.push({ role: "user", text: userText });
    aiChatHistory.push({ role: "model", text: botReply });
    if (aiChatHistory.length > 8) aiChatHistory = aiChatHistory.slice(-8);

  } catch (err) {
    const typingInd = document.getElementById("ai-typing-indicator");
    if (typingInd) typingInd.remove();
    appendAiBubble("Beklager, jeg hadde problemer med å kontakte serveren akkurat nå. Vennligst prøv igjen om et øyeblikk.", "bot");
  } finally {
    isAiTyping = false;
    if (btnAiSend) btnAiSend.disabled = false;
  }
}

function appendAiBubble(text, sender, recommendedServices = []) {
  if (!aiMessagesFeed) return;
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

function openServiceByHandle(handle) {
  const s = allServices.find(x => x.handle === handle);
  if (s) openServiceModal(s);
}

// ==========================================================================
// 8. APPLICATION INITIALIZATION
// ==========================================================================
updateNavAuthDisplay();
loadCatalog();
