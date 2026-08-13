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
