/**
 * PN Digital - Google Drive indexer (read-only source scan)
 * Pilot scope: Law curriculum (CTĐT ngành Luật).
 * Source files are never renamed, moved, edited or deleted.
 */
const CONFIG = {
  INDEX_FOLDER: "PN Digital - Index",
  INDEX_FILE: "ctdt-nganh-luat-index.json",
  MAX_FILES_PER_SCAN: 5000,
  EXCLUDED_MIME_PREFIXES: ["image/", "video/"],
  EXCLUDED_NAME_TERMS: [
    "anh gia dinh", "anh ca nhan", "family photo", "personal photo",
    "ho chieu", "passport", "can cuoc", "cccd", "cmnd",
    "so tai khoan", "bank statement", "sao ke", "mat khau", "password"
  ],
  EXCLUDED_FOLDER_TERMS: [
    "anh gia dinh", "anh ca nhan", "family", "personal photos",
    "ho so ca nhan", "tai lieu rieng", "private", "passport", "cccd"
  ]
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Admin")
    .setTitle("PN Digital - Kết nối Google Drive");
}

function getStatus() {
  return {
    connected: true,
    account: Session.getEffectiveUser().getEmail() || "Tài khoản đang đăng nhập",
    scope: "Chỉ đọc metadata; không đọc nội dung tệp",
    pilot: "CTĐT ngành Luật"
  };
}

function scanLawCurriculum() {
  const started = new Date();
  const files = DriveApp.getFiles();
  const records = [];
  let scanned = 0;
  let excluded = 0;
  let matched = 0;
  let pending = 0;

  while (files.hasNext() && scanned < CONFIG.MAX_FILES_PER_SCAN) {
    const file = files.next();
    scanned++;
    const item = classifyFile_(file);
    if (item.excluded) {
      excluded++;
      continue;
    }
    if (item.category === "CTĐT ban hành" || item.category === "Hồ sơ xây dựng CTĐT") {
      matched++;
      records.push(item);
    } else if (item.category === "Chờ phân loại") {
      pending++;
    }
  }

  records.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pilot: "CTĐT ngành Luật",
    scanMode: "metadata-only",
    scannedCount: scanned,
    matchedCount: matched,
    excludedCount: excluded,
    pendingCount: pending,
    truncated: scanned >= CONFIG.MAX_FILES_PER_SCAN,
    categories: {
      issued: records.filter(x => x.category === "CTĐT ban hành"),
      development: records.filter(x => x.category === "Hồ sơ xây dựng CTĐT")
    },
    reviewRequired: true
  };

  const folder = getOrCreateIndexFolder_();
  const existing = folder.getFilesByName(CONFIG.INDEX_FILE);
  const json = JSON.stringify(payload, null, 2);
  if (existing.hasNext()) {
    existing.next().setContent(json);
  } else {
    folder.createFile(CONFIG.INDEX_FILE, json, MimeType.PLAIN_TEXT);
  }

  return {
    ok: true,
    scanned: scanned,
    matched: matched,
    excluded: excluded,
    pending: pending,
    truncated: payload.truncated,
    indexFile: CONFIG.INDEX_FILE,
    folder: CONFIG.INDEX_FOLDER,
    durationSeconds: Math.round((new Date() - started) / 1000)
  };
}

function classifyFile_(file) {
  const name = file.getName();
  const mime = file.getMimeType() || "";
  const normalized = normalize_(name);
  const parents = file.getParents();
  const parentNames = [];
  while (parents.hasNext()) parentNames.push(parents.next().getName());
  const folderText = normalize_(parentNames.join(" "));
  const excluded = CONFIG.EXCLUDED_MIME_PREFIXES.some(p => mime.indexOf(p) === 0) ||
    containsAny_(normalized, CONFIG.EXCLUDED_NAME_TERMS.map(normalize_)) ||
    containsAny_(folderText, CONFIG.EXCLUDED_FOLDER_TERMS.map(normalize_));
  if (excluded) return { excluded: true };

  const text = normalize_(name + " " + parentNames.join(" "));
  const law = /\b(luat|law|nganh luat|khoa luat)\b/.test(text);
  const issued = /\b(ctdt|chuong trinh dao tao)\b/.test(text) &&
    /\b(ban hanh|quyet dinh|qd|phe duyet|chinh thuc)\b/.test(text);
  const development = /\b(ctdt|chuong trinh dao tao)\b/.test(text) ||
    /\b(chuan dau ra|ma tran|khao sat|tham dinh|du thao|gop y|bien ban|de cuong hoc phan)\b/.test(text);
  let category = "Không thuộc phạm vi thử nghiệm";
  if (law && issued) category = "CTĐT ban hành";
  else if (law && development) category = "Hồ sơ xây dựng CTĐT";
  else if (/\b(ctdt|chuong trinh dao tao|nganh luat)\b/.test(text)) category = "Chờ phân loại";

  return {
    id: file.getId(),
    name: name,
    mimeType: mime,
    url: file.getUrl(),
    modifiedTime: file.getLastUpdated().toISOString(),
    size: file.getSize(),
    parentFolders: parentNames,
    category: category
  };
}

function getOrCreateIndexFolder_() {
  const found = DriveApp.getFoldersByName(CONFIG.INDEX_FOLDER);
  return found.hasNext() ? found.next() : DriveApp.createFolder(CONFIG.INDEX_FOLDER);
}

function normalize_(value) {
  return String(value || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
}

function containsAny_(text, terms) {
  return terms.some(term => term && text.indexOf(term) !== -1);
}
