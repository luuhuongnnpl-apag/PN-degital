/**
 * PN Digital - lightweight Google Drive title search.
 * Read-only pilot for CTĐT ngành Luật. Never modifies source files.
 */
const CONFIG = {
  MAX_PER_QUERY: 60,
  MAX_TOTAL: 120,
  EXCLUDED_MIME_PREFIXES: ["image/", "video/"],
  EXCLUDED_TERMS: [
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
    scope: "Chỉ đọc tên tệp và metadata tối thiểu",
    pilot: "CTĐT ngành Luật"
  };
}

/**
 * Searches filenames only, in small independent queries.
 * Avoids fullText search, whole-Drive iteration, parent-folder lookups,
 * and per-file modification-time/size calls.
 */
function scanLawCurriculum() {
  const started = Date.now();
  const queries = [
    "trashed = false and title contains 'CTĐT'",
    "trashed = false and title contains 'chương trình đào tạo'",
    "trashed = false and title contains 'chuong trinh dao tao'"
  ];
  const seen = {};
  const preview = [];
  let found = 0, excluded = 0, issued = 0, development = 0, pending = 0;

  for (let q = 0; q < queries.length && found < CONFIG.MAX_TOTAL; q++) {
    const files = DriveApp.searchFiles(queries[q]);
    let inQuery = 0;
    while (files.hasNext() && inQuery < CONFIG.MAX_PER_QUERY &&
           found < CONFIG.MAX_TOTAL) {
      const file = files.next();
      inQuery++;
      const id = file.getId();
      if (seen[id]) continue;
      seen[id] = true;

      const name = file.getName();
      const mime = file.getMimeType() || "";
      const normalized = normalize_(name);
      if (CONFIG.EXCLUDED_MIME_PREFIXES.some(p => mime.indexOf(p) === 0) ||
          containsAny_(normalized, CONFIG.EXCLUDED_TERMS.map(normalize_))) {
        excluded++;
        continue;
      }

      found++;
      const category = classifyName_(normalized);
      if (category === "CTĐT ban hành") issued++;
      else if (category === "Hồ sơ xây dựng CTĐT") development++;
      else pending++;

      preview.push({
        name: name,
        mimeType: mime,
        url: "https://drive.google.com/open?id=" + id,
        category: category
      });
    }
  }

  return {
    ok: true,
    mode: "filename-only",
    candidates: found,
    excluded: excluded,
    issued: issued,
    development: development,
    pending: pending,
    preview: preview,
    truncated: found >= CONFIG.MAX_TOTAL,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    note: "Chỉ tìm theo tên tệp; kết quả phân loại là gợi ý và cần rà soát."
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
