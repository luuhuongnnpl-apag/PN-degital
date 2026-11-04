/**
 * PN Digital - Drive metadata search (read-only)
 * Pilot: CTĐT ngành Luật. Source files are never changed.
 * Search is narrowed to likely curriculum-related files to avoid a full-Drive walk.
 */
const CONFIG = {
  MAX_CANDIDATES: 800,
  MAX_PREVIEW: 150,
  EXCLUDED_MIME_PREFIXES: ["image/", "video/"],
  EXCLUDED_NAME_TERMS: [
    "anh gia dinh", "anh ca nhan", "family photo", "personal photo",
    "ho chieu", "passport", "can cuoc", "cccd", "cmnd",
    "so tai khoan", "bank statement", "sao ke", "mat khau", "password"
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
    scope: "Chỉ đọc metadata và tìm kiếm nội dung được Drive lập chỉ mục",
    pilot: "CTĐT ngành Luật"
  };
}

/**
 * Search only likely CTĐT candidates. No folder/file is created or modified.
 * DriveApp.searchFiles uses Drive search syntax; candidate search is much faster
 * than enumerating every file and querying every parent folder.
 */
function scanLawCurriculum() {
  const started = Date.now();
  const query = [
    "trashed = false",
    "(" +
      "title contains 'CTĐT' or " +
      "title contains 'chương trình đào tạo' or " +
      "title contains 'chuong trinh dao tao' or " +
      "fullText contains 'CTĐT' or " +
      "fullText contains 'chương trình đào tạo'" +
    ")"
  ].join(" and ");

  const iterator = DriveApp.searchFiles(query);
  const records = [];
  let candidates = 0, excluded = 0, issued = 0, development = 0, pending = 0;
  while (iterator.hasNext() && candidates < CONFIG.MAX_CANDIDATES) {
    const file = iterator.next();
    candidates++;
    const mime = file.getMimeType() || "";
    const name = file.getName();
    const normalized = normalize_(name);

    if (CONFIG.EXCLUDED_MIME_PREFIXES.some(p => mime.indexOf(p) === 0) ||
        containsAny_(normalized, CONFIG.EXCLUDED_NAME_TERMS.map(normalize_))) {
      excluded++;
      continue;
    }

    const category = classifyName_(normalized);
    if (category === "CTĐT ban hành") issued++;
    else if (category === "Hồ sơ xây dựng CTĐT") development++;
    else pending++;

    if (records.length < CONFIG.MAX_PREVIEW) {
      records.push({
        name: name,
        mimeType: mime,
        url: file.getUrl(),
        modifiedTime: file.getLastUpdated().toISOString(),
        category: category
      });
    }
  }

  return {
    ok: true,
    mode: "targeted-read-only-search",
    candidates: candidates,
    excluded: excluded,
    issued: issued,
    development: development,
    pending: pending,
    preview: records,
    previewLimit: CONFIG.MAX_PREVIEW,
    candidateLimitReached: candidates >= CONFIG.MAX_CANDIDATES,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    note: "Kết quả tìm kiếm gợi ý theo metadata và nội dung Drive lập chỉ mục; cần rà soát thủ công."
  };
}

function classifyName_(text) {
  const law = /\b(luat|law|nganh luat|khoa luat)\b/.test(text);
  const ctdt = /\b(ctdt|chuong trinh dao tao)\b/.test(text);
  const issued = /\b(ban hanh|quyet dinh|qd|phe duyet|chinh thuc)\b/.test(text);
  const development = /\b(du thao|gop y|bien ban|tham dinh|khao sat|ma tran|chuan dau ra|ho so xay dung)\b/.test(text);
  if (ctdt && law && issued) return "CTĐT ban hành";
  if (ctdt && (law || development)) return "Hồ sơ xây dựng CTĐT";
  return "Chờ phân loại";
}

function normalize_(value) {
  return String(value || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
}

function containsAny_(text, terms) {
  return terms.some(term => term && text.indexOf(term) !== -1);
}
