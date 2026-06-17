const invoiceInput = document.querySelector("#invoiceInput");
const shopName = document.querySelector("#shopName");
const transType = document.querySelector("#transType");
const vehicleNo = document.querySelector("#vehicleNo");
const addressPicker = document.querySelector("#addressPicker");
const generateBtn = document.querySelector("#generateBtn");
const clearBtn = document.querySelector("#clearBtn");
const copyBtn = document.querySelector("#copyBtn");
const exportExcelBtn = document.querySelector("#exportExcelBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const clearHistoryBtn = document.querySelector("#clearHistoryBtn");
const statusBox = document.querySelector("#status");
const output = document.querySelector("#output");
const summary = document.querySelector("#summary");
const batchSummary = document.querySelector("#batchSummary");
const batchWarnings = document.querySelector("#batchWarnings");
const fileList = document.querySelector("#fileList");
const historyList = document.querySelector("#historyList");
const validationReport = document.querySelector("#validationReport");
const validationList = document.querySelector("#validationList");
const addressBookList = null;
const reviewWorkspace = document.querySelector("#reviewWorkspace");
const reviewSummary = document.querySelector("#reviewSummary");
const reviewAlerts = document.querySelector("#reviewAlerts");
const reviewBills = document.querySelector("#reviewBills");
const supportedExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".json"];
const HISTORY_STORAGE_KEY = "billlist.uploadHistory.v1";
const MAX_HISTORY_ITEMS = 12;

let selectedFiles = [];
let generated = null;
let shopProfiles = {};
let editableBillLists = [];
let addressBook = [];
let seededBuyerPresets = [];
let uploadHistory = [];

invoiceInput.addEventListener("change", () => setFiles(Array.from(invoiceInput.files || [])));
shopName.addEventListener("change", () => {
  updateGenerateState();
});
transType.addEventListener("change", updateTransTypeUi);
vehicleNo.addEventListener("input", updateGenerateState);
generateBtn.addEventListener("click", generateBatch);
clearBtn.addEventListener("click", clearAll);
copyBtn.addEventListener("click", copyOutput);
exportExcelBtn.addEventListener("click", exportExcel);
downloadBtn.addEventListener("click", downloadOutput);
clearHistoryBtn.addEventListener("click", clearUploadHistory);

document.querySelector(".drop-zone").addEventListener("dragover", (event) => {
  event.preventDefault();
  document.querySelector(".drop-zone").classList.add("dragging");
});

document.querySelector(".drop-zone").addEventListener("dragleave", () => {
  document.querySelector(".drop-zone").classList.remove("dragging");
});

document.querySelector(".drop-zone").addEventListener("drop", (event) => {
  event.preventDefault();
  document.querySelector(".drop-zone").classList.remove("dragging");
  setFiles(Array.from(event.dataTransfer.files || []).filter(isSupportedInvoiceFile));
});

document.querySelectorAll('input[name="addressChoice"]').forEach((radio) => {
  radio.addEventListener("change", updateAddressSelection);
});

batchSummary.classList.add("hidden");
batchWarnings.classList.add("hidden");
reviewAlerts.classList.add("hidden");

loadMeta().catch(() => {
  setStatus("Could not load the shop list from the local server.", "error");
});

function setFiles(files) {
  selectedFiles = files.filter(isSupportedInvoiceFile);
  invoiceInput.value = "";
  generated = null;
  editableBillLists = [];
  shopName.value = "";
  renderFileList();
  clearValidationReport();
  renderReview();
  refreshOutput();
  updateTransTypeUi();

  const mode = getUploadMode();
  if (mode === "json") {
    setStatus("1 JSON file selected. Ready to validate.", "ok");
  } else if (mode === "mixed") {
    setStatus("Upload either invoice files or one JSON file at a time.", "error");
  } else {
    setStatus(selectedFiles.length ? `${selectedFiles.length} invoice file(s) selected.` : "Waiting for invoices.", selectedFiles.length ? "ok" : "");
  }

  if (mode === "invoice") {
    detectShopFromSelection();
  }
}

async function loadMeta() {
  const response = await fetch("/api/meta");
  if (!response.ok) throw new Error("Could not load metadata.");
  const payload = await response.json();
  shopProfiles = payload.shopProfiles && typeof payload.shopProfiles === "object" ? payload.shopProfiles : {};
  seededBuyerPresets = Array.isArray(payload.buyerPresets) ? payload.buyerPresets : [];
  populateShopList(Array.isArray(payload.shops) ? payload.shops : []);
  populateAddressList(Array.isArray(payload.addressPresets) ? payload.addressPresets : []);
  loadAddressBook(seededBuyerPresets);
  loadUploadHistory();
}

function populateShopList(shops) {
  const current = shopName.value;
  const options = ["<option value=\"\">Select shop</option>"]
    .concat(shops.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`))
    .join("");
  shopName.innerHTML = options;
  if (shops.includes(current)) {
    shopName.value = current;
  }
}

async function detectShopFromSelection() {
  if (!selectedFiles.length || getUploadMode() !== "invoice") return;

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append("invoices", file));

  try {
    const response = await fetch("/api/detect-shop", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) return;
    const detected = typeof payload.shopName === "string" ? payload.shopName : "";
    if (detected && shopProfiles[detected]) {
      shopName.value = detected;
      updateGenerateState();
      if (payload.score) {
        setStatus(`Detected ${detected} from the uploaded invoice.`, "ok");
      }
    }
  } catch {
    // best effort only
  }
}

function populateAddressList(addresses) {
  const labels = document.querySelectorAll(".address-option small");
  addresses.slice(0, labels.length).forEach((address, index) => {
    labels[index].textContent = `${address.toAddr1}, ${address.toAddr2}, ${address.toPlace}, ${address.toPincode}`;
  });
}

function renderFileList() {
  fileList.innerHTML = "";
  selectedFiles.forEach((file, index) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.textContent = `${index + 1}. ${file.name}`;
    link.className = "file-link";
    link.addEventListener("click", () => {
      setTimeout(() => URL.revokeObjectURL(link.href), 0);
    });

    const size = document.createElement("span");
    size.textContent = `(${formatBytes(file.size)})`;
    size.className = "file-size";

    item.appendChild(link);
    item.appendChild(size);
    fileList.appendChild(item);
  });
}

function updateTransTypeUi() {
  const isTypeTwo = transType.value === "2" && getUploadMode() === "invoice";
  addressPicker.classList.toggle("hidden", !isTypeTwo);
  updateGenerateState();
}

function updateAddressSelection() {
  updateGenerateState();
}

function updateGenerateState() {
  const mode = getUploadMode();
  const ready =
    (mode === "json" && selectedFiles.length === 1) ||
    (mode === "invoice" && selectedFiles.length > 0 && isValidVehicleNo(vehicleNo.value) && shopName.value.trim().length > 0);
  generateBtn.textContent = mode === "json" ? "Validate JSON" : "Generate billLists";
  generateBtn.disabled = !ready;
}

function getUploadMode(files = selectedFiles) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return "none";

  const jsonCount = list.filter(isJsonFile).length;
  if (jsonCount > 0) {
    if (jsonCount !== list.length || list.length !== 1) return "mixed";
    return "json";
  }

  return "invoice";
}

function isJsonFile(file) {
  return normalizeText(file?.name || "").toLowerCase().endsWith(".json");
}

function loadAddressBook(defaults = []) {
  try {
    const raw = localStorage.getItem(getAddressBookStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    const saved = Array.isArray(parsed) ? parsed : [];
    addressBook = mergeAddressBooks(defaults, saved);
  } catch {
    addressBook = Array.isArray(defaults) ? defaults.slice() : [];
  }
  localStorage.setItem(getAddressBookStorageKey(), JSON.stringify(addressBook, null, 2));
  renderAddressBook();
}

function mergeAddressBooks(defaults, saved) {
  const merged = [];
  const seen = new Set();
  for (const preset of [...(Array.isArray(defaults) ? defaults : []), ...(Array.isArray(saved) ? saved : [])]) {
    if (!preset || typeof preset !== "object") continue;
    const key = addressPresetKey(preset);
    if (seen.has(key)) {
      const index = merged.findIndex((entry) => addressPresetKey(entry) === key);
      if (index >= 0 && preset.source === "local") {
        merged[index] = preset;
      }
      continue;
    }
    seen.add(key);
    merged.push(preset);
  }
  return merged;
}

function saveAddressBook() {
  localStorage.setItem(getAddressBookStorageKey(), JSON.stringify(addressBook, null, 2));
  renderAddressBook();
}

function getAddressBookStorageKey() {
  return "billlist.addressBook.v1";
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeGstin(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "");
}

function addressPresetKey(preset) {
  const gstin = normalizeGstin(preset.gstin);
  const shop = normalizeText(preset.shopName).toLowerCase();
  return gstin ? `gstin::${gstin}` : `shop::${shop}`;
}

function findAddressPresetMatch({ shopName: shop, gstin }) {
  const normalizedShop = normalizeText(shop).toLowerCase();
  const normalizedGstin = normalizeGstin(gstin);
  if (!addressBook.length) return null;
  return (
    addressBook.find((preset) => normalizeText(preset.shopName).toLowerCase() === normalizedShop && normalizeGstin(preset.gstin) === normalizedGstin) ||
    addressBook.find((preset) => normalizeGstin(preset.gstin) === normalizedGstin) ||
    addressBook.find((preset) => normalizeText(preset.shopName).toLowerCase() === normalizedShop) ||
    null
  );
}

function renderAddressBook() {
  if (!addressBookList) return;
  addressBookList.innerHTML = "";
  if (!addressBook.length) {
    const empty = document.createElement("div");
    empty.className = "address-book-empty muted";
    empty.textContent = "No buyer presets saved yet.";
    addressBookList.appendChild(empty);
    return;
  }

  addressBook
    .slice()
    .sort((a, b) => (normalizeText(a.label || "").localeCompare(normalizeText(b.label || ""))))
    .forEach((preset) => {
      const item = document.createElement("article");
      item.className = "address-book-item";
      item.innerHTML = `
        <div class="address-book-item-head">
          <div>
            <div class="address-book-title">${escapeHtml(preset.label || preset.shopName || preset.gstin || "Preset")}</div>
            <div class="muted">${escapeHtml([preset.shopName, preset.gstin].filter(Boolean).join(" | "))}</div>
          </div>
          <div class="toolbar-actions">
            <button type="button" class="secondary address-book-apply">Apply</button>
            <button type="button" class="secondary address-book-delete">Delete</button>
          </div>
        </div>
        <div class="address-book-value">${escapeHtml(formatPresetAddress(preset))}</div>
      `;

      item.querySelector(".address-book-apply").addEventListener("click", () => applyPresetToVisibleBills(preset));
      item.querySelector(".address-book-delete").addEventListener("click", () => deleteAddressPreset(preset));
      addressBookList.appendChild(item);
    });
}

function formatPresetAddress(preset) {
  return [preset.toAddr1, preset.toAddr2, preset.toPlace, preset.toPincode].filter(Boolean).join(", ");
}

function deleteAddressPreset(preset) {
  const key = addressPresetKey(preset);
  addressBook = addressBook.filter((entry) => addressPresetKey(entry) !== key);
  saveAddressBook();
  setStatus("Deleted a buyer preset.", "ok");
}

function clearAddressBook() {
  if (!addressBook.length) return;
  const confirmClear = window.confirm("Clear all saved buyer presets?");
  if (!confirmClear) return;
  addressBook = [];
  saveAddressBook();
  setStatus("Cleared saved buyer presets.", "ok");
}

function upsertAddressPresetFromBill(billIndex) {
  const bill = editableBillLists[billIndex];
  if (!bill) return;
  const shop = normalizeText(shopName.value.trim());
  const gstin = normalizeGstin(bill.toGstin || bill.userGstin || "");
  if (!shop && !gstin) {
    setStatus("Need a shop name or buyer GSTIN to save a preset.", "error");
    return;
  }

  const label = window.prompt("Preset name", bill.toTrdName || bill.toGstin || shop || "Buyer preset");
  if (label === null) return;

  const preset = {
    label: normalizeText(label) || bill.toTrdName || bill.toGstin || shop || "Buyer preset",
    shopName: shop || bill.shopName || "",
    gstin,
    buyerName: normalizeText(bill.toTrdName || ""),
    toAddr1: normalizeText(bill.toAddr1 || ""),
    toAddr2: normalizeText(bill.toAddr2 || ""),
    toPlace: normalizeText(bill.toPlace || ""),
    toPincode: Number(bill.toPincode || 0),
    actualToStateCode: Number(bill.actualToStateCode || bill.toStateCode || 0),
  };

  const key = addressPresetKey(preset);
  addressBook = addressBook.filter((entry) => addressPresetKey(entry) !== key);
  addressBook.push(preset);
  saveAddressBook();
  setStatus(`Saved preset for ${preset.label}.`, "ok");
}

function applyPresetToVisibleBills(preset) {
  if (!preset || !Array.isArray(editableBillLists)) return;
  editableBillLists.forEach((bill, index) => {
    if (!bill) return;
    const shop = normalizeText(shopName.value.trim());
    const billGstin = normalizeGstin(bill.toGstin || bill.userGstin || "");
    const presetShop = normalizeText(preset.shopName).toLowerCase();
    const presetGstin = normalizeGstin(preset.gstin);
    if (presetShop && presetShop !== shop.toLowerCase() && presetGstin !== billGstin) return;
    applyAddressPresetToBill(bill, preset);
  });
  if (generated) {
    generated.billLists = editableBillLists;
  }
  renderReview();
  refreshOutput();
  setStatus(`Applied preset: ${preset.label || "buyer preset"}.`, "ok");
}

function applyAddressPresetToBill(bill, preset) {
  bill.toAddr1 = normalizeText(preset.toAddr1 || bill.toAddr1 || "");
  bill.toAddr2 = normalizeText(preset.toAddr2 || bill.toAddr2 || "");
  bill.toPlace = normalizeText(preset.toPlace || bill.toPlace || "");
  bill.toPincode = Number(preset.toPincode || bill.toPincode || 0);
  bill.actualToStateCode = Number(preset.actualToStateCode || bill.actualToStateCode || bill.toStateCode || 0);
  if (bill.toPincode) {
    bill.transDistance = calculateDistanceFromFrontend(bill.fromPincode, bill.toPincode);
  }
}

function applyStoredAddressPresets() {
  if (!Array.isArray(editableBillLists) || !addressBook.length) return;
  let changed = false;
  editableBillLists.forEach((bill) => {
    const preset = findAddressPresetMatch({
      shopName: shopName.value.trim(),
      gstin: bill.toGstin || bill.userGstin || "",
    });
    if (!preset) return;
    applyAddressPresetToBill(bill, preset);
    changed = true;
  });
  if (changed && generated) {
    generated.billLists = editableBillLists;
  }
}

function loadUploadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    uploadHistory = Array.isArray(parsed) ? parsed : [];
  } catch {
    uploadHistory = [];
  }
  renderUploadHistory();
}

function saveUploadHistory() {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(uploadHistory, null, 2));
  renderUploadHistory();
}

function clearUploadHistory() {
  if (!uploadHistory.length) return;
  if (!window.confirm("Clear all upload history?")) return;
  uploadHistory = [];
  saveUploadHistory();
  setStatus("Cleared upload history.", "ok");
}

function saveCurrentBatchToHistory(mode) {
  if (!generated || !Array.isArray(editableBillLists) || !editableBillLists.length) return;
  const summary = computeBatchSummary(editableBillLists, generated.reviewMeta || []);
  const { duplicateMap, ...summaryData } = summary;
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    mode: mode || "invoice",
    shopName: shopName.value.trim(),
    transType: transType.value,
    vehicleNo: vehicleNo.value.trim(),
    fileNames: selectedFiles.map((file) => file.name),
    summary: cloneValue(summaryData),
    payload: cloneValue({
      version: generated.version,
      billLists: cloneBills(editableBillLists),
      reviewMeta: cloneValue(generated.reviewMeta || []),
    }),
  };

  uploadHistory = [entry, ...uploadHistory.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY_ITEMS);
  saveUploadHistory();
}

function loadHistoryEntry(entryId) {
  const entry = uploadHistory.find((item) => item.id === entryId);
  if (!entry || !entry.payload) return;

  generated = cloneValue(entry.payload);
  editableBillLists = cloneBills(entry.payload.billLists || []);
  selectedFiles = [];
  invoiceInput.value = "";
  shopName.value = entry.shopName || shopName.value;
  transType.value = String(entry.transType || transType.value || "1");
  vehicleNo.value = entry.vehicleNo || vehicleNo.value;
  clearValidationReport();
  renderFileList();
  refreshOutput();
  renderReview();
  updateTransTypeUi();
  updateGenerateState();
  setStatus(`Loaded history batch from ${formatDateTime(entry.createdAt)}.`, "ok");
}

function renderUploadHistory() {
  if (!historyList) return;
  historyList.innerHTML = "";
  if (!uploadHistory.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty muted";
    empty.textContent = "No saved batches yet.";
    historyList.appendChild(empty);
    return;
  }

  uploadHistory.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "history-item";
    const summary = entry.summary || {};
    const files = Array.isArray(entry.fileNames) && entry.fileNames.length ? entry.fileNames.join(", ") : "No files stored";
    item.innerHTML = `
      <div class="history-item-head">
        <div>
          <div class="history-title">${escapeHtml(formatDateTime(entry.createdAt))}</div>
          <div class="muted">${escapeHtml([entry.shopName, entry.mode].filter(Boolean).join(" | ") || "Saved batch")}</div>
        </div>
        <div class="toolbar-actions">
          <button type="button" class="secondary history-load">Load</button>
          <button type="button" class="secondary history-delete">Delete</button>
        </div>
      </div>
      <div class="history-metrics">
        <span>${escapeHtml(`${summary.billCount || 0} bills`)}</span>
        <span>${escapeHtml(`Invoice ${formatMoney(summary.invoiceTotal || 0)}`)}</span>
        <span>${escapeHtml(`${summary.duplicateCount || 0} duplicates`)}</span>
      </div>
      <div class="history-files">${escapeHtml(files)}</div>
    `;

    item.querySelector(".history-load").addEventListener("click", () => loadHistoryEntry(entry.id));
    item.querySelector(".history-delete").addEventListener("click", () => deleteHistoryEntry(entry.id));
    historyList.appendChild(item);
  });
}

function deleteHistoryEntry(entryId) {
  uploadHistory = uploadHistory.filter((item) => item.id !== entryId);
  saveUploadHistory();
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function buildBillSignature(bill) {
  const fromGstin = normalizeGstin(bill?.fromGstin || "");
  const docNoValue = normalizeText(bill?.docNo || "").toLowerCase();
  const docDateValue = normalizeText(bill?.docDate || "");
  if (!fromGstin || !docNoValue || !docDateValue) return "";
  return [fromGstin, docNoValue, docDateValue].join("|");
}

function collectDuplicateBills(bills) {
  const counts = new Map();
  (Array.isArray(bills) ? bills : []).forEach((bill, index) => {
    const signature = buildBillSignature(bill);
    if (!signature.trim()) return;
    const entry = counts.get(signature) || { count: 0, indexes: [] };
    entry.count += 1;
    entry.indexes.push(index);
    counts.set(signature, entry);
  });
  return counts;
}

function buildHistorySignatureSet() {
  const signatures = new Set();
  uploadHistory.forEach((entry) => {
    const bills = Array.isArray(entry?.payload?.billLists) ? entry.payload.billLists : [];
    bills.forEach((bill) => signatures.add(buildBillSignature(bill)));
  });
  return signatures;
}

function computeBatchSummary(bills = editableBillLists, reviews = generated?.reviewMeta || []) {
  const list = Array.isArray(bills) ? bills : [];
  const reviewList = Array.isArray(reviews) ? reviews : [];
  const duplicateMap = collectDuplicateBills(list);
  const duplicateCount = Array.from(duplicateMap.values()).reduce((total, entry) => total + Math.max(0, entry.count - 1), 0);
  const historySignatureSet = buildHistorySignatureSet();
  const historyDuplicateCount = list.reduce((total, bill) => total + (historySignatureSet.has(buildBillSignature(bill)) ? 1 : 0), 0);

  const taxableTotal = roundSum(list.map((bill) => Number(bill?.totalValue) || 0));
  const cgstTotal = roundSum(list.map((bill) => Number(bill?.cgstValue) || 0));
  const sgstTotal = roundSum(list.map((bill) => Number(bill?.sgstValue) || 0));
  const igstTotal = roundSum(list.map((bill) => Number(bill?.igstValue) || 0));
  const roundoffTotal = roundSum(list.map((bill) => Number(bill?.OthValue) || 0));
  const invoiceTotal = roundSum(list.map((bill) => Number(bill?.totInvValue) || 0));
  const lowConfidenceBills = list.reduce((total, _, index) => total + (Number(reviewList[index]?.overallConfidence || 0) < 55 ? 1 : 0), 0);
  const lowOcrBills = list.reduce((total, _, index) => total + (Number(reviewList[index]?.ocrQualityScore || 0) < 55 ? 1 : 0), 0);

  const warningMessages = [];
  if (duplicateCount) {
    warningMessages.push(`${duplicateCount} duplicate invoice signature${duplicateCount === 1 ? "" : "s"} found in the current batch.`);
  }
  if (historyDuplicateCount) {
    warningMessages.push(`${historyDuplicateCount} invoice${historyDuplicateCount === 1 ? "" : "s"} also exists in upload history.`);
  }
  if (lowConfidenceBills) {
    warningMessages.push(`${lowConfidenceBills} bill${lowConfidenceBills === 1 ? "" : "s"} have low extraction confidence.`);
  }
  if (lowOcrBills) {
    warningMessages.push(`${lowOcrBills} bill${lowOcrBills === 1 ? "" : "s"} have low OCR quality.`);
  }

  return {
    billCount: list.length,
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    roundoffTotal,
    invoiceTotal,
    duplicateCount,
    historyDuplicateCount,
    lowConfidenceBills,
    lowOcrBills,
    warningMessages,
    duplicateMap,
  };
}

function renderBatchSummary() {
  const summaryData = computeBatchSummary();
  if (!batchSummary) return;

  if (!generated || !editableBillLists.length) {
    batchSummary.innerHTML = "";
    batchSummary.classList.add("hidden");
    batchWarnings.innerHTML = "";
    batchWarnings.classList.add("hidden");
    return;
  }

  batchSummary.classList.remove("hidden");
  const cards = [
    ["Bills", summaryData.billCount],
    ["Taxable", formatMoney(summaryData.taxableTotal)],
    ["Tax", formatMoney(summaryData.cgstTotal + summaryData.sgstTotal + summaryData.igstTotal)],
    ["Invoice", formatMoney(summaryData.invoiceTotal)],
    ["Duplicates", summaryData.duplicateCount],
    ["Low confidence", summaryData.lowConfidenceBills],
    ["Low OCR", summaryData.lowOcrBills],
  ];

  batchSummary.innerHTML = cards
    .map(
      ([label, value]) => `
        <div class="summary-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value))}</strong>
        </div>
      `,
    )
    .join("");

  batchWarnings.innerHTML = summaryData.warningMessages.length
    ? `
      <div class="section-title">Warnings</div>
      <ul class="warning-list">
        ${summaryData.warningMessages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
      </ul>
    `
    : "";
  batchWarnings.classList.toggle("hidden", summaryData.warningMessages.length === 0);
}

function roundSum(values) {
  return roundMoney(values.reduce((total, value) => total + (Number(value) || 0), 0));
}

function roundMoney(value) {
  const numeric = Number(value) || 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  const numeric = Number(value) || 0;
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric);
}

function formatDateTime(value) {
  if (!value) return "Unknown time";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function generateBatch() {
  if (!selectedFiles.length) return;
  const mode = getUploadMode();
  if (mode === "mixed") {
    setStatus("Upload either invoice files or one JSON file at a time.", "error");
    return;
  }
  if (mode === "json") {
    if (selectedFiles.length !== 1) {
      setStatus("Upload only one JSON file at a time.", "error");
      return;
    }
    setStatus("Validating JSON file...", "");
  } else {
    if (!isValidVehicleNo(vehicleNo.value)) {
      setStatus("Enter a valid vehicle number like AP03AU2457.", "error");
      return;
    }
    if (!shopName.value.trim()) {
      setStatus("Select a shop before generating.", "error");
      return;
    }
  }

  setStatus(mode === "json" ? "Validating JSON file..." : "Reading invoices and running OCR when needed...", "");
  generateBtn.disabled = true;

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append("invoices", file));
  if (mode !== "json") {
    formData.append("shopName", shopName.value.trim());
    formData.append("transType", transType.value);
    formData.append("vehicleNo", vehicleNo.value.trim());
    formData.append("addressChoice", getSelectedAddressChoice());
  }

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error || "Generation failed.");
      error.validationErrors = Array.isArray(payload.validationErrors) ? payload.validationErrors : [];
      throw error;
    }

    editableBillLists = cloneBills(payload.billLists);
    generated = {
      version: payload.version,
      reviewMeta: Array.isArray(payload.reviewMeta) ? payload.reviewMeta : [],
      billLists: editableBillLists,
    };
    if (mode !== "json") {
      applyStoredAddressPresets();
    }
    refreshOutput();
    renderReview();
    saveCurrentBatchToHistory(mode);
    copyBtn.disabled = false;
    exportExcelBtn.disabled = false;
    downloadBtn.disabled = false;
    clearValidationReport();
    setStatus(mode === "json" ? "JSON validation complete." : "Batch generation complete.", "ok");
  } catch (error) {
    generated = null;
    renderReview();
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      setStatus("Could not reach the local server. Start the app server, then open http://127.0.0.1:8000.", "error");
    } else {
      const validationErrors = Array.isArray(error.validationErrors) ? error.validationErrors : [];
      if (validationErrors.length) {
        renderValidationReport(validationErrors);
      } else {
        clearValidationReport();
      }
      setStatus(error.message, "error");
    }
  } finally {
    updateGenerateState();
  }
}

function renderReview() {
  const bills = Array.isArray(editableBillLists) ? editableBillLists : [];
  const reviews = Array.isArray(generated?.reviewMeta) ? generated.reviewMeta : [];
  const summaryData = computeBatchSummary(bills, reviews);
  reviewBills.innerHTML = "";
  reviewWorkspace.classList.toggle("hidden", bills.length === 0);
  reviewSummary.textContent = bills.length ? `${bills.length} billList${bills.length === 1 ? "" : "s"} ready for review.` : "No extracted bills yet.";
  reviewAlerts.innerHTML = summaryData.warningMessages.length
    ? `
      <div class="section-title">Batch alerts</div>
      <ul class="warning-list">
        ${summaryData.warningMessages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
      </ul>
    `
    : "";
  reviewAlerts.classList.toggle("hidden", summaryData.warningMessages.length === 0);

  bills.forEach((bill, index) => {
    const meta = reviews[index] || {};
    reviewBills.appendChild(buildBillEditor(bill, meta, index, summaryData.duplicateMap.get(buildBillSignature(bill)) || null));
  });
}

function buildBillEditor(bill, meta, index, duplicateInfo = null) {
  const card = document.createElement("article");
  card.className = "review-card";
  if (duplicateInfo && duplicateInfo.count > 1) {
    card.classList.add("duplicate-card");
  }

  const confidenceLevel = normalizeConfidence(meta.level || confidenceLevelFromScore(meta.overallConfidence));
  const qualityLevel = normalizeConfidence(meta.ocrQualityLevel || confidenceLevelFromScore(meta.ocrQualityScore));
  const qualityWarnings = Array.isArray(meta.qualityWarnings) ? meta.qualityWarnings : [];
  const header = document.createElement("div");
  header.className = "review-card-head";
  header.innerHTML = `
    <div class="review-card-info">
      <div class="section-title">${escapeHtml(bill.docNo || `Bill ${index + 1}`)}</div>
      <div class="review-card-meta">
        <span class="muted">${escapeHtml(meta.fileName || bill.docDate || "")}</span>
        ${duplicateInfo && duplicateInfo.count > 1 ? `<span class="pill pill-warn">Duplicate x${duplicateInfo.count}</span>` : ""}
        ${meta.ocrQualityScore !== undefined ? `<span class="pill pill-soft">OCR ${escapeHtml(formatScore(meta.ocrQualityScore))}</span>` : ""}
      </div>
    </div>
    <div class="confidence-badge confidence-${confidenceLevel}">${formatScore(meta.overallConfidence)}</div>
  `;
  card.appendChild(header);

  if (qualityWarnings.length) {
    const warning = document.createElement("div");
    warning.className = `review-note confidence-${qualityLevel}`;
    warning.innerHTML = `
      <strong>OCR check</strong>
      <div>${qualityWarnings.map((message) => escapeHtml(message)).join("<br />")}</div>
    `;
    card.appendChild(warning);
  }

  const grid = document.createElement("div");
  grid.className = "bill-grid";
  const topFields = [
    ["userGstin", "Buyer GSTIN", "text"],
    ["supplyType", "Supply Type", "text"],
    ["subSupplyType", "Sub Supply", "number"],
    ["docType", "Doc Type", "text"],
    ["docNo", "Doc No", "text"],
    ["docDate", "Doc Date", "text"],
    ["transType", "Trans Type", "number"],
    ["transMode", "Trans Mode", "number"],
    ["transDocDate", "Transport Date", "text"],
    ["vehicleNo", "Vehicle No", "text"],
    ["fromGstin", "Seller GSTIN", "text"],
    ["fromTrdName", "Seller Name", "text"],
    ["fromAddr1", "Seller Addr 1", "text"],
    ["fromAddr2", "Seller Addr 2", "text"],
    ["fromPlace", "Seller Place", "text"],
    ["fromPincode", "Seller Pincode", "number"],
    ["fromStateCode", "Seller State", "number"],
    ["actualFromStateCode", "Seller State", "number"],
    ["toGstin", "Buyer GSTIN", "text"],
    ["toTrdName", "Buyer Name", "text"],
    ["toAddr1", "Buyer Addr 1", "text"],
    ["toAddr2", "Buyer Addr 2", "text"],
    ["toPlace", "Buyer Place", "text"],
    ["toPincode", "Buyer Pincode", "number"],
    ["toStateCode", "Buyer State", "number"],
    ["actualToStateCode", "Buyer State", "number"],
    ["totalValue", "Taxable Value", "number"],
    ["cgstValue", "CGST Value", "number"],
    ["sgstValue", "SGST Value", "number"],
    ["igstValue", "IGST Value", "number"],
    ["OthValue", "Roundoff", "number"],
    ["totInvValue", "Invoice Value", "number"],
    ["transDistance", "Distance", "number"],
    ["mainHsnCode", "HSN", "number"],
    ["vehicleType", "Vehicle Type", "text"],
  ];

  topFields.forEach(([path, label, type]) => {
    grid.appendChild(createFieldControl(index, bill, meta, path, label, type));
  });
  card.appendChild(grid);

  const itemSection = document.createElement("div");
  itemSection.className = "items-section";
  const itemTitle = document.createElement("div");
  itemTitle.className = "section-title";
  itemTitle.textContent = "Item list";
  itemSection.appendChild(itemTitle);

  const table = document.createElement("table");
  table.className = "items-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>Description</th>
        <th>HSN</th>
        <th>Qty</th>
        <th>UOM</th>
        <th>Taxable</th>
        <th>SGST</th>
        <th>CGST</th>
        <th>IGST</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  const items = Array.isArray(bill.itemList) ? bill.itemList : [];
  items.forEach((item, itemIndex) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${itemIndex + 1}</td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
    `;
    const cells = row.querySelectorAll("td");
    cells[1].appendChild(createInlineField(index, `itemList.${itemIndex}.productName`, item.productName, meta, "text"));
    cells[2].appendChild(createInlineField(index, `itemList.${itemIndex}.productDesc`, item.productDesc, meta, "text"));
    cells[3].appendChild(createInlineField(index, `itemList.${itemIndex}.hsnCode`, item.hsnCode, meta, "number"));
    cells[4].appendChild(createInlineField(index, `itemList.${itemIndex}.quantity`, item.quantity, meta, "number"));
    cells[5].appendChild(createInlineField(index, `itemList.${itemIndex}.qtyUnit`, item.qtyUnit, meta, "text"));
    cells[6].appendChild(createInlineField(index, `itemList.${itemIndex}.taxableAmount`, item.taxableAmount, meta, "number"));
    cells[7].appendChild(createInlineField(index, `itemList.${itemIndex}.sgstRate`, item.sgstRate, meta, "number"));
    cells[8].appendChild(createInlineField(index, `itemList.${itemIndex}.cgstRate`, item.cgstRate, meta, "number"));
    cells[9].appendChild(createInlineField(index, `itemList.${itemIndex}.igstRate`, item.igstRate, meta, "number"));
    body.appendChild(row);
  });
  itemSection.appendChild(table);
  card.appendChild(itemSection);

  return card;
}

function createFieldControl(billIndex, bill, meta, path, label, type) {
  const wrapper = document.createElement("label");
  wrapper.className = `review-field confidence-${getFieldConfidenceLevel(meta, path)}`;
  const title = document.createElement("span");
  title.textContent = label;
  wrapper.appendChild(title);

  const input = document.createElement("input");
  input.type = type === "number" ? "number" : "text";
  input.value = valueToInput(bill[path]);
  if (type === "number") {
    input.step = "any";
  }
  input.addEventListener("input", () => {
    updateBillValue(billIndex, path, type === "number" ? parseNumericInput(input.value) : input.value);
    refreshOutput();
  });
  wrapper.appendChild(input);
  return wrapper;
}

function createInlineField(billIndex, path, value, meta, type) {
  const input = document.createElement("input");
  input.type = type === "number" ? "number" : "text";
  input.value = valueToInput(value);
  input.className = `inline-edit confidence-${getFieldConfidenceLevel(meta, path)}`;
  if (type === "number") {
    input.step = "any";
  }
  input.addEventListener("input", () => {
    updateBillValue(billIndex, path, type === "number" ? parseNumericInput(input.value) : input.value);
    refreshOutput();
  });
  return input;
}

function getFieldConfidenceLevel(meta, path) {
  const field = getConfidenceEntry(meta, path);
  const score = field?.score ?? 0;
  return normalizeConfidence(field?.level || confidenceLevelFromScore(score));
}

function getConfidenceEntry(meta, path) {
  if (!meta) return null;
  if (path.startsWith("itemList.")) {
    const match = path.match(/^itemList\.(\d+)\.(.+)$/);
    if (!match) return null;
    const itemIndex = Number(match[1]);
    const fieldPath = match[2];
    const item = Array.isArray(meta.itemConfidence) ? meta.itemConfidence[itemIndex] : null;
    return item?.fieldConfidence?.[fieldPath] || null;
  }
  return meta.fieldConfidence?.[path] || null;
}

function confidenceLevelFromScore(score) {
  const numeric = Number(score) || 0;
  if (numeric >= 80) return "high";
  if (numeric >= 55) return "medium";
  return "low";
}

function normalizeConfidence(value) {
  const text = String(value || "").toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  return "low";
}

function formatScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "0%";
  return `${Math.round(numeric)}%`;
}

function refreshOutput() {
  if (!generated) {
    output.textContent = "{}";
    summary.textContent = "No output yet.";
    renderBatchSummary();
    copyBtn.disabled = true;
    exportExcelBtn.disabled = true;
    downloadBtn.disabled = true;
    return;
  }
  const exportPayload = getExportPayload();
  output.textContent = JSON.stringify(exportPayload, null, 2);
  summary.textContent = `${exportPayload.billLists.length} billList${exportPayload.billLists.length === 1 ? "" : "s"} generated.`;
  renderBatchSummary();
  copyBtn.disabled = false;
  exportExcelBtn.disabled = false;
  downloadBtn.disabled = false;
}

function getExportPayload() {
  if (!generated) return {};
  const exportPayload = {
    version: generated.version,
    billLists: cloneBills(editableBillLists),
  };
  return exportPayload;
}

function updateBillValue(billIndex, path, value) {
  const bill = editableBillLists?.[billIndex];
  if (!bill) return;
  const parts = path.split(".");
  let target = bill;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const nextKey = parts[index + 1];
    if (Array.isArray(target)) {
      target = target[Number(key)];
    } else if (target[key] !== undefined) {
      target = target[key];
    }
    if (target === undefined || target === null) return;
  }
  const finalKey = parts[parts.length - 1];
  if (Array.isArray(target)) {
    target[Number(finalKey)] = value;
  } else {
    target[finalKey] = value;
  }
  if (path === "fromPincode" || path === "toPincode") {
    bill.transDistance = calculateDistanceFromFrontend(bill.fromPincode, bill.toPincode);
  }
  if (generated) {
    generated.billLists = editableBillLists;
  }
  refreshOutput();
}

function parseNumericInput(value) {
  const cleaned = String(value).trim();
  if (!cleaned) return 0;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function valueToInput(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function cloneBills(bills) {
  if (!Array.isArray(bills)) return [];
  if (typeof structuredClone === "function") {
    return structuredClone(bills);
  }
  return JSON.parse(JSON.stringify(bills));
}

function calculateDistanceFromFrontend(fromPincode, toPincode) {
  const from = Number(fromPincode || 0);
  const to = Number(toPincode || 0);
  if (!from || !to) return 0;
  if (from === to) return 2;
  const specialKey = `${from}-${to}`;
  const special = {
    "517501-517507": 2,
    "517507-517501": 2,
    "625516-600021": 545,
    "600021-625516": 545,
  }[specialKey];
  if (special) return special;
  const fromPrefix = Math.floor(from / 1000);
  const toPrefix = Math.floor(to / 1000);
  if (fromPrefix === toPrefix) return 2;
  const prefixGap = Math.abs(fromPrefix - toPrefix);
  const digitGap = Math.abs(from - to);
  if (prefixGap === 0) {
    return Math.max(2, Math.round(digitGap / 2500) + 1);
  }
  const roughKm = prefixGap * 45 + Math.round(digitGap / 12000);
  return roughKm > 0 ? roughKm : 2;
}

async function copyOutput() {
  if (!generated) return;
  await navigator.clipboard.writeText(JSON.stringify(getExportPayload(), null, 2));
  setStatus("Copied the generated JSON.", "ok");
}

function downloadOutput() {
  if (!generated) return;
  const blob = new Blob([JSON.stringify(getExportPayload(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = buildDownloadFileName("json");
  link.click();
  URL.revokeObjectURL(link.href);
}

async function exportExcel() {
  if (!generated) return;
  setStatus("Creating Excel workbook...", "");

  try {
    const response = await fetch("/api/export-xlsx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getWorkbookPayload()),
    });

    if (!response.ok) {
      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }
      const error = new Error(payload.error || "Excel export failed.");
      error.validationErrors = Array.isArray(payload.validationErrors) ? payload.validationErrors : [];
      throw error;
    }

    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = buildDownloadFileName("xlsx");
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("Excel workbook downloaded.", "ok");
  } catch (error) {
    if (Array.isArray(error.validationErrors) && error.validationErrors.length) {
      renderValidationReport(error.validationErrors);
    }
    setStatus(error.message || "Excel export failed.", "error");
  }
}

function getWorkbookPayload() {
  if (!generated) return {};
  return {
    version: generated.version,
    billLists: cloneBills(editableBillLists),
    reviewMeta: cloneValue(generated.reviewMeta || []),
  };
}

function buildDownloadFileName(extension = "json") {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `EwayJson${date}${time}.${extension}`;
}

function clearAll() {
  selectedFiles = [];
  generated = null;
  invoiceInput.value = "";
  shopName.value = "";
  vehicleNo.value = "";
  output.textContent = "{}";
  summary.textContent = "No output yet.";
  fileList.innerHTML = "";
  reviewBills.innerHTML = "";
  reviewWorkspace.classList.add("hidden");
  editableBillLists = [];
  copyBtn.disabled = true;
  exportExcelBtn.disabled = true;
  downloadBtn.disabled = true;
  clearValidationReport();
  renderBatchSummary();
  reviewAlerts.innerHTML = "";
  reviewAlerts.classList.add("hidden");
  setStatus("Waiting for invoices.");
  updateTransTypeUi();
}

function renderValidationReport(errors) {
  validationList.innerHTML = "";
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    validationList.appendChild(item);
  });
  validationReport.classList.remove("hidden");
}

function clearValidationReport() {
  validationList.innerHTML = "";
  validationReport.classList.add("hidden");
}

function setStatus(message, state = "") {
  statusBox.textContent = message;
  statusBox.className = `status ${state}`.trim();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function isValidVehicleNo(value) {
  const cleaned = value.trim().replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(cleaned);
}

function getSelectedAddressChoice() {
  const selected = document.querySelector('input[name="addressChoice"]:checked');
  return selected ? selected.value : "0";
}

function isSupportedInvoiceFile(file) {
  const name = file.name.toLowerCase();
  return supportedExtensions.some((extension) => name.endsWith(extension));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

updateTransTypeUi();
setFiles([]);

