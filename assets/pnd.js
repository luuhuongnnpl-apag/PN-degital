/*
  PHÚC NGUYÊN DIGITAL — thư viện số
  ------------------------------------------------------------------
  - Cây thư mục Google Drive (tài khoản quản trị) là bộ khung của web:
      Kho PND / <Danh mục> / <Nhóm> / <Thẻ> / tệp…
  - Firebase Firestore lưu chỉ mục (pnd_tree, pnd_items), mã tài khoản (pnd_ma),
    người dùng mã (pnd_users), cấu hình (pnd_settings), nhật ký (pnd_activity).
  - Quyền xem: quản trị viên xem hết; người có mã tài khoản xem các danh mục được cấp
    (giống mã lớp của PNL); quy tắc bảo mật Firestore kiểm soát phía máy chủ.
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, writeBatch, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const CFG = window.PND_CONFIG || {};
const app = initializeApp(CFG.FIREBASE);
const auth = getAuth(app);
const db = getFirestore(app);
const ADMINS = (CFG.ADMIN_EMAILS || []).map(s => s.toLowerCase());
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER = "application/vnd.google-apps.folder";
const ROOT_NAME = "PND - Phúc Nguyên Digital";

/* ---------- Danh mục cố định (khớp tên thư mục cấp 1 trên Drive) ---------- */
const BASE_CATS = [
  { key: "van-ban", name: "Văn bản quy chế", label: ["VĂN BẢN ", "QUY CHẾ"], title: "VĂN BẢN QUY CHẾ", group: true, color: ["#2e5c8a", "#4f86b8"], icon: "doc",
    sub: { "VB - Viên chức, giảng viên": ["Quy chế làm việc", "Quy chế chi tiêu nội bộ", "Quy chế nghiên cứu khoa học"], "VB - Đào tạo, sinh viên": ["Kiểm tra, đánh giá", "Quy chế đào tạo đại học"] } },
  { key: "ctdt", name: "Chương trình đào tạo", label: ["CHƯƠNG TRÌNH ", "ĐÀO TẠO"], title: "CHƯƠNG TRÌNH ĐÀO TẠO", group: true, color: ["#6a3fa0", "#9a73c9"], icon: "cap",
    sub: { "Chương trình đào tạo đã ban hành": ["CTĐT 2025", "CTĐT 2023", "CTĐT 2021"], "Hồ sơ phát triển CTĐT": ["CTĐT 2025", "CTĐT 2023", "CTĐT 2021"] } },
  { key: "de-cuong", name: "Đề cương học phần", label: ["ĐỀ CƯƠNG HỌC PHẦN"], title: "ĐỀ CƯƠNG CHI TIẾT", group: true, color: ["#1f7a6d", "#46a798"], icon: "book",
    sub: { "Đề cương chi tiết đã ban hành": ["CTĐT 2025", "CTĐT 2023", "CTĐT 2021"], "Đề cương học phần giảng dạy": [] } },
  { key: "giang-day", name: "Tài liệu giảng dạy", label: ["TÀI LIỆU GIẢNG DẠY"], title: "TÀI LIỆU GIẢNG DẠY", group: false, color: ["#a5402d", "#d36d52"], icon: "board",
    sub: { "Luật Đất đai": ["Luật Đất đai năm 2026 (dự thảo)", "Luật Đất đai 2024 và các văn bản hướng dẫn thi hành", "Luật Đất đai năm 2013 và các văn bản hướng dẫn thi hành"] } },
  { key: "nckh", name: "Nghiên cứu khoa học", label: ["NGHIÊN CỨU KHOA HỌC"], title: "NGHIÊN CỨU KHOA HỌC", group: false, color: ["#24527a", "#3d8bbd"], icon: "flask", sub: {} },
  { key: "the-thao", name: "Khoa học thể thao", label: ["KHOA HỌC THỂ THAO"], title: "KHOA HỌC THỂ THAO", group: false, color: ["#2f7d32", "#66a95a"], icon: "run", sub: {} },
  { key: "y-hoc", name: "Y học thường thức", label: ["Y HỌC THƯỜNG THỨC"], title: "Y HỌC THƯỜNG THỨC", group: false, color: ["#b23a5a", "#dc6d8a"], icon: "heart", sub: {} },
  { key: "khac", name: "Tài liệu khác", label: ["TÀI LIỆU KHÁC"], title: "TÀI LIỆU KHÁC", group: false, color: ["#5b6675", "#8a96a6"], icon: "folder", sub: {} },
  { key: "cho", name: "Chờ phân loại", label: ["CHỜ PHÂN LOẠI"], title: "CHỜ PHÂN LOẠI", group: false, color: ["#8a6d1f", "#c29a35"], icon: "inbox", sub: {}, adminOnly: true }
];
/* Bộ sưu tập (danh mục cấp 1): bộ mặc định + bộ do quản trị thêm, đổi tên, sắp xếp (pnd_settings/root.catDefs) */
let CATS = BASE_CATS.slice(), CAT = {}, PUBLIC_CATS = [];
const CAT_COLORS = [["#2e5c8a", "#4f86b8"], ["#6a3fa0", "#9a73c9"], ["#1f7a6d", "#46a798"], ["#a5402d", "#d36d52"], ["#24527a", "#3d8bbd"], ["#2f7d32", "#66a95a"], ["#b23a5a", "#dc6d8a"], ["#5b6675", "#8a96a6"], ["#8a6d1f", "#c29a35"], ["#0f6b7a", "#3aa0b0"], ["#7a3b16", "#b8693a"], ["#3a3f8f", "#6b70c9"]];
function applyCatDefs() {
  const defs = { ...((settings && settings.catDefs) || {}) }, roots = { ...((settings && settings.cats) || {}) };
  if (!defs["bst-ghi-chu"]) defs["bst-ghi-chu"] = { name: "Ghi chú", icon: "doc", color: ["#b45309", "#d97706"], order: 45 };
  if (!roots["bst-ghi-chu"]) roots["bst-ghi-chu"] = "root-bst-ghi-chu";
  const list = BASE_CATS.map((c, i) => {
    const d = defs[c.key] || {};
    const name = d.name || c.name;
    return { ...c, name, title: d.name ? name.toUpperCase() : c.title, label: d.name ? [name.toUpperCase()] : c.label, color: d.color || c.color, icon: d.icon || c.icon, order: Number.isFinite(d.order) ? d.order : i, removed: !!d.removed };
  });
  for (const [k, d] of Object.entries(defs)) if (!BASE_CATS.some(c => c.key === k) && !d.removed && roots[k])
    list.push({ key: k, name: d.name, title: d.name.toUpperCase(), label: [d.name.toUpperCase()], group: false, color: d.color || CAT_COLORS[7], icon: d.icon || "folder", sub: {}, custom: true, order: Number.isFinite(d.order) ? d.order : 50 });
  list.sort((a, b) => (a.key === "cho") - (b.key === "cho") || a.order - b.order);
  CATS = list.filter(c => !c.removed && (!settings || roots[c.key] || c.key === "cho" || c.key === "bst-ghi-chu"));
  CAT = Object.fromEntries(list.map(c => [c.key, c]));
  PUBLIC_CATS = CATS.filter(c => !c.adminOnly);
}

/* ---------- Trạng thái ---------- */
let settings = null;        // {rootId, cats:{key:folderId}}
applyCatDefs();
let tree = {};              // folderId -> {id,name,parent,cat,depth}
let items = {};             // fileId -> item
let thongDung = [];         // [{id,name,cat,parent}]
let user = null, isAdmin = false;
let acct = null;            // hồ sơ tài khoản (pnd_accounts/{email}) của người đang đăng nhập
let session = loadSession(); // {code,han,cats}
let driveTok = loadTok();
let loaded = { tree: false, items: false };
let authReady = false;

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const fmtDate = s => { const p = String(s || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : (s || ""); };
const norm = s => String(s || "").toUpperCase().replace(/\s+/g, "").replace(/[–—]/g, "-");
const okCode = c => /^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(c);
const vi = new Intl.Collator("vi", { sensitivity: "base", numeric: true });
const yearOf = s => { const m = String(s || "").match(/(19|20)\d{2}/g); return m ? +m[m.length - 1] : 0; };
const ACCT_DOMAIN = "taikhoan.pnd";   // tên đăng nhập không có @ được đổi thành <tên>@taikhoan.pnd cho Firebase
const toEmail = u => { u = String(u || "").trim().toLowerCase(); return u.includes("@") ? u : u.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9._-]/g, "") + "@" + ACCT_DOMAIN; };
const showName = e => String(e || "").endsWith("@" + ACCT_DOMAIN) ? String(e).split("@")[0] : String(e || "");
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Hộp xác nhận / nhập liệu ngay trong trang (trình duyệt nhúng có thể chặn confirm/prompt) */
function ask(msg, opt = {}) {
  return new Promise(res => {
    const d = $("#dlgConfirm");
    $("#cfTitle").textContent = opt.title || "XÁC NHẬN";
    $("#cfMsg").textContent = msg;
    $("#cfInputWrap").hidden = !opt.input; $("#cfInput").value = opt.value || ""; $("#cfInputLbl").textContent = opt.input || "";
    const sel = $("#cfSelect"); sel.hidden = !opt.options; if (opt.options) sel.innerHTML = opt.options;
    const ex = $("#cfExtra"); ex.innerHTML = ""; if (opt.node) ex.appendChild(opt.node);
    $("#cfYes").textContent = opt.ok || "Đồng ý";
    const done = v => { d.close(); $("#cfYes").onclick = $("#cfNo").onclick = null; res(v); };
    $("#cfYes").onclick = () => done(opt.input ? $("#cfInput").value.trim() : opt.options ? sel.value : true);
    $("#cfNo").onclick = () => done(opt.input || opt.options ? null : false);
    d.onclose = () => { if ($("#cfYes").onclick) done(opt.input || opt.options ? null : false); };
    d.showModal(); if (opt.input) setTimeout(() => $("#cfInput").focus(), 50);
  });
}
let toastT;
function toast(msg, kind) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (kind ? " " + kind : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, kind === "err" ? 8000 : 4500); }

function loadSession() { try { const s = JSON.parse(localStorage.getItem("pnd_ma") || "null"); if (s && s.code && s.han && s.han >= todayISO()) return s; } catch (e) {} return null; }
function saveSession(s) { try { s ? localStorage.setItem("pnd_ma", JSON.stringify(s)) : localStorage.removeItem("pnd_ma"); } catch (e) {} session = s; }
function loadTok() { try { const t = JSON.parse(localStorage.getItem("pnd_drive") || "null"); if (t && t.exp > Date.now() + 60000) return t.t; } catch (e) {} return null; }
function saveTok(t, sec) { driveTok = t; try { t ? localStorage.setItem("pnd_drive", JSON.stringify({ t, exp: Date.now() + Math.max(300, (sec || 3600) - 300) * 1000 })) : localStorage.removeItem("pnd_drive"); } catch (e) {} }
function isAdminUser(u) { return !!u && !u.isAnonymous && (u.uid === CFG.ADMIN_UID || (!!u.email && u.emailVerified !== false && ADMINS.includes(u.email.toLowerCase()))); }

/* ---------- Vai trò & mức truy cập (một hệ thống chung cho tài khoản và mã truy cập) ---------- */
const LEVELS = [
  { key: "cong-khai", name: "Công khai", desc: "Ai vào thư viện cũng xem được" },
  { key: "noi-bo", name: "Nội bộ", desc: "Người có tài khoản hoặc mã truy cập" },
  { key: "han-che", name: "Hạn chế", desc: "Tài khoản được cấp quyền mở rộng" },
  { key: "mat", name: "Mật", desc: "Chỉ quản trị viên xem được" }
];
const LV = Object.fromEntries(LEVELS.map(l => [l.key, l]));
const L3 = ["cong-khai", "noi-bo", "han-che"];
const ROLES = {
  "xem":        { name: "Độc giả", desc: "Xem tài liệu Công khai và Nội bộ; không tải về", levels: ["cong-khai", "noi-bo"], dl: false, up: false },
  "xem-rong":   { name: "Độc giả mở rộng", desc: "Xem mọi tài liệu (Công khai, Nội bộ, Hạn chế); không tải về", levels: L3, dl: false, up: false },
  "chuyen-muc": { name: "Người dùng chuyên mục", desc: "Xem tài liệu (kể cả Hạn chế) trong các danh mục được chọn và được tải về", levels: L3, dl: true, up: false },
  "bien-muc":   { name: "Thủ thư / Biên mục", desc: "Xem, tải về, tải lên; quản lý thư mục và tài liệu", levels: L3, dl: true, up: true },
  "quan-tri":   { name: "Quản trị hệ thống", desc: "Toàn quyền: mọi tài liệu kể cả Mật, cấp tài khoản và phân quyền", levels: [...L3, "mat"], dl: true, up: true, admin: true }
};
const GUEST = { name: "Khách", desc: "Chưa đăng nhập: xem tài liệu Công khai", levels: ["cong-khai"], dl: false, up: false };
const DEFAULT_LEVEL = "noi-bo";
const grantOk = g => !!g && !g.disabled && (!g.han || g.han >= todayISO());
function myGrant() {
  if (isAdmin) return { role: "quan-tri", cats: ["*"] };
  if (acct && grantOk(acct)) return acct;
  if (session) return { role: session.role || "chuyen-muc", cats: session.cats || ["*"], han: session.han };
  return null;
}
function myRole() { const g = myGrant(); return g ? (ROLES[g.role] || ROLES["chuyen-muc"]) : GUEST; }
const canDl = () => myRole().dl;
const canUp = () => myRole().up;
function canCat(key) {
  if (isAdmin) return true;
  if (CAT[key] && CAT[key].adminOnly) return false;
  const g = myGrant();
  if (!g) return true;                       // khách vẫn duyệt danh mục, chỉ thấy tài liệu Công khai
  const cs = g.cats || ["*"];
  return cs.includes("*") || cs.includes(key);
}
const levelOf = f => f.access || DEFAULT_LEVEL;
function canSee(f) { return isAdmin || (!f.locked && canCat(f.cat) && f.cat !== "cho" && myRole().levels.includes(levelOf(f))); }
/* Ai cũng thấy tên tài liệu (trừ Mật, Chờ phân loại); mở xem được hay không theo quyền (canSee) */
const canBrowse = key => isAdmin || !(CAT[key] && CAT[key].adminOnly);
function canList(f) { return isAdmin || (canBrowse(f.cat) && f.cat !== "cho" && levelOf(f) !== "mat"); }
function lockReason(f) {
  const lv = LV[levelOf(f)].name, g = myGrant();
  if (!g) return "Tài liệu mức " + lv + ": cần đăng nhập bằng tài khoản hoặc mã truy cập được cấp quyền để xem.";
  if (!canCat(f.cat)) return "Tài khoản của bạn chưa được cấp quyền danh mục “" + (CAT[f.cat] ? CAT[f.cat].name : f.cat) + "”. Liên hệ quản trị viên để được mở quyền.";
  return "Tài liệu mức " + lv + ": quyền “" + myRole().name + "” của bạn chưa được xem. Liên hệ quản trị viên để được nâng quyền.";
}
/* Mức truy cập mặc định của thư mục: lấy theo thư mục gần nhất có đặt, không có thì Nội bộ */
function folderLevel(id, t) { t = t || tree; let n = t[id], g = 0; while (n && g++ < 30) { if (n.access) return n.access; n = t[n.parent]; } return DEFAULT_LEVEL; }
const lvChip = (k, extra) => `<span class="lv-chip lv-${esc(k)}">${esc((LV[k] || LV[DEFAULT_LEVEL]).name)}${extra || ""}</span>`;
function visibleCats() { return isAdmin ? CATS : PUBLIC_CATS; }

/* ---------- Ảnh bìa tự sinh ---------- */
const ICONS = {
  doc: '<rect x="56" y="24" width="48" height="62" rx="4" fill="#fff" opacity=".95"/><path d="M64 38h32M64 47h32M64 56h24" stroke="#9fb6cf" stroke-width="3" stroke-linecap="round"/><circle cx="92" cy="74" r="9" fill="#e8b84a"/><path d="M88 74l3 3 5-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  cap: '<path d="M80 30l40 16-40 16-40-16z" fill="#fff"/><path d="M58 54v14c0 6 10 11 22 11s22-5 22-11V54l-22 9z" fill="#fff" opacity=".85"/><path d="M116 48v20" stroke="#e8b84a" stroke-width="3"/><circle cx="116" cy="70" r="3.5" fill="#e8b84a"/>',
  book: '<path d="M38 34c14-6 28-6 42 2v50c-14-8-28-8-42-2z" fill="#fff"/><path d="M122 34c-14-6-28-6-42 2v50c14-8 28-8 42-2z" fill="#fff" opacity=".85"/><path d="M48 46h22M48 54h22M90 46h22M90 54h22" stroke="#9fb6cf" stroke-width="2.4" stroke-linecap="round"/>',
  board: '<rect x="36" y="26" width="88" height="54" rx="4" fill="#fff"/><path d="M48 42h40M48 52h56M48 62h32" stroke="#c7a28f" stroke-width="3" stroke-linecap="round"/><path d="M72 80l-10 16M88 80l10 16" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  flask: '<path d="M70 24h20M73 24v22l-22 38c-3 6 1 12 8 12h42c7 0 11-6 8-12L87 46V24" fill="#fff"/><path d="M58 76h44l6 10c1 3-1 6-4 6H56c-3 0-5-3-4-6z" fill="#7fc3ea"/><circle cx="76" cy="66" r="3" fill="#7fc3ea"/><circle cx="86" cy="58" r="2.4" fill="#7fc3ea"/>',
  run: '<circle cx="92" cy="28" r="8" fill="#fff"/><path d="M86 40l-14 16 12 8-6 22M86 40l10 14 14 2M76 50l-16 2M84 64l18 10" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  heart: '<path d="M80 94S40 70 40 46c0-12 9-20 20-20 9 0 15 6 20 12 5-6 11-12 20-12 11 0 20 8 20 20 0 24-40 48-40 48z" fill="#fff"/><path d="M80 46v24M68 58h24" stroke="#dc6d8a" stroke-width="6" stroke-linecap="round"/>',
  folder: '<path d="M38 36h30l8 8h46v44c0 3-2 5-5 5H43c-3 0-5-2-5-5z" fill="#fff"/><path d="M38 50h84" stroke="#c9d1dc" stroke-width="3"/>',
  inbox: '<path d="M40 54l14-26h52l14 26v32c0 3-2 5-5 5H45c-3 0-5-2-5-5z" fill="#fff"/><path d="M40 56h24l6 10h20l6-10h24" stroke="#c29a35" stroke-width="3" fill="none"/>',
  key: '<circle cx="62" cy="58" r="16" fill="none" stroke="#fff" stroke-width="7"/><path d="M76 58h42M106 58v12M96 58v9" stroke="#fff" stroke-width="7" stroke-linecap="round"/>',
  cal: '<rect x="44" y="30" width="72" height="60" rx="6" fill="#fff"/><rect x="44" y="30" width="72" height="16" rx="6" fill="#e8b84a"/><path d="M58 24v12M102 24v12" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M56 58h10M74 58h10M92 58h10M56 72h10M74 72h10" stroke="#9fb6cf" stroke-width="5" stroke-linecap="round"/>',
  cloud: '<path d="M54 82h56c11 0 18-8 18-17s-7-16-16-17c-2-11-11-18-22-18-10 0-18 6-21 15-11 0-19 8-19 18s7 19 18 19z" fill="#fff"/><path d="M70 64h22M81 53v22" stroke="#5f8fc0" stroke-width="5" stroke-linecap="round"/>',
  mail: '<rect x="38" y="32" width="84" height="56" rx="6" fill="#fff"/><path d="M40 36l40 30 40-30" stroke="#c0504d" stroke-width="5" fill="none" stroke-linejoin="round"/>',
  lib: '<path d="M44 86V44l36-16 36 16v42" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M56 50v30M70 50v30M90 50v30M104 50v30M40 88h80" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
};
function cover(icon, colors, label) {
  const [a, b] = colors, id = "g" + rid();
  const tag = label ? `<rect x="96" y="92" width="58" height="22" rx="11" fill="#fff" opacity=".92"/><text x="125" y="108" text-anchor="middle" font-family="Be Vietnam Pro,Arial" font-size="13" font-weight="700" fill="${a}">${esc(label)}</text>` : "";
  return `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="120" fill="url(#${id})"/><circle cx="140" cy="16" r="34" fill="#fff" opacity=".08"/><circle cx="14" cy="110" r="26" fill="#fff" opacity=".07"/>${ICONS[icon] || ICONS.folder}${tag}</svg>`;
}

/* ---------- Định dạng tệp, bìa sách, kích thước ---------- */
const FMT = { pdf: ["PDF", "PDF"], word: ["Word / Văn bản", "DOC"], note: ["Văn bản Ghi chú", "GHI CHÚ"], excel: ["Excel / Bảng tính", "XLS"], ppt: ["PowerPoint / Trình chiếu", "PPT"], image: ["Hình ảnh", "ẢNH"], media: ["Video / Âm thanh", "MEDIA"], link: ["Liên kết web", "LINK"], khac: ["Tệp khác", "FILE"] };
function driveIdFrom(s) {
  s = String(s || "").trim();
  const m = s.match(/(?:drive|docs)\.google\.com\/.*?(?:\/d\/|folders\/|[?&]id=)([\w-]{20,})/) || s.match(/^([\w-]{25,})$/);
  return m ? m[1] : "";
}
function driveIdOf(f) { if (f.locked || f.isNote) return ""; return f.driveId || (f.mime && f.mime !== "link" ? f.id : driveIdFrom(f.link)); }
function fmtOf(f) {
  const m = String(f.fmime || f.mime || ""), ext = (String(f.name || "").toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || "";
  if (f.isNote || m === "text/html" || m === "note") return "note";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (/wordprocessing|msword|google-apps\.document|opendocument\.text/.test(m) || /^(docx?|odt|rtf)$/.test(ext)) return "word";
  if (/spreadsheet|ms-excel|google-apps\.spreadsheet|text\/csv/.test(m) || /^(xlsx?|ods|csv)$/.test(ext)) return "excel";
  if (/presentation|powerpoint|google-apps\.presentation/.test(m) || /^(pptx?|odp)$/.test(ext)) return "ppt";
  if (/^image\//.test(m) || /^(jpe?g|png|gif|webp|bmp)$/.test(ext)) return "image";
  if (/^(video|audio)\//.test(m) || /^(mp4|mov|mp3|wav|m4a|avi|mkv)$/.test(ext)) return "media";
  if (m === "link") return driveIdOf(f) ? "khac" : "link";
  return "khac";
}
const yearOfItem = f => yearOf(f.issued) || yearOf(f.name) || yearOf(f.modified || f.added);
const fmtSize = n => !n ? "" : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1).replace(".", ",") + " MB";
const stCls = s => /^Còn/.test(s) ? "on" : /một phần/.test(s) ? "mid" : /Hết/.test(s) ? "off" : "mid";
function bookHTML(f) {
  const cat = CAT[f.cat] || CAT.khac, k = fmtOf(f), id = driveIdOf(f);
  const thumb = f.coverUrl || (id && f.shared !== false ? "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w400" : "");
  const lv = levelOf(f);
  return `<div class="book${f.locked ? " is-locked" : ""}">${f.locked ? '<span class="lock-ic" aria-label="Chưa được mở">🔒</span>' : ""}${lv !== "cong-khai" ? `<span class="badge-lv lv-${lv}">${LV[lv] ? LV[lv].name : ""}</span>` : ""}<span class="spine" style="background:${cat.color[0]}"></span><img class="bl" src="./assets/logo.png" alt=""><span class="bc">${esc(cat.name)}</span>${thumb ? `<img class="real" src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="badge-ft ${k}">${FMT[k][1]}</span></div>`;
}

/* ---------- Tải dữ liệu ---------- */
async function loadSettings() {
  try { const s = await getDoc(doc(db, "pnd_settings", "root")); settings = s.exists() ? s.data() : null; } catch (e) { settings = null; }
  applyCatDefs();
  try { const s = await getDoc(doc(db, "pnd_settings", "thongdung")); thongDung = s.exists() ? (s.data().items || []) : []; } catch (e) { thongDung = []; }
}
async function loadTree() {
  try { const snap = await getDocs(collection(db, "pnd_tree")); tree = {}; snap.forEach(d => tree[d.id] = d.data()); } catch (e) { console.warn("tree", e); }
  const ghiChuRoot = (settings && settings.cats && settings.cats["bst-ghi-chu"]) || "root-bst-ghi-chu";
  if (!tree[ghiChuRoot]) tree[ghiChuRoot] = { id: ghiChuRoot, name: (CAT["bst-ghi-chu"] && CAT["bst-ghi-chu"].name) || "Ghi chú", parent: (settings && settings.rootId) || "root", cat: "bst-ghi-chu", depth: 1 };
  loaded.tree = true;
}
let catalog = {};   // pnd_catalog: danh mục công khai (tên, thông tin ban hành) của mọi tài liệu trừ Mật — không có đường link
const CATALOG_FIELDS = ["name", "cat", "parent", "access", "number", "issuer", "issued", "effective", "status", "star", "order", "fmime", "mime", "size", "modified", "added", "coverUrl", "isNote"];
function catalogEntry(f) { const o = {}; for (const k of CATALOG_FIELDS) if (f[k] !== undefined && f[k] !== null && f[k] !== "") o[k] = f[k]; if (o.mime && o.mime !== "link") o.mime = "file"; return o; }
async function loadCatalog() {
  catalog = {};
  try {
    const q = isAdmin ? collection(db, "pnd_catalog") : query(collection(db, "pnd_catalog"), where("access", "in", L3));
    (await getDocs(q)).forEach(d => catalog[d.id] = d.data());
  } catch (e) { console.warn("danh mục công khai", e.message); }
  if (!isAdmin) for (const [id, c] of Object.entries(catalog)) if (!items[id]) items[id] = { ...c, id, locked: true };
}
/* Người quản lý: đồng bộ pnd_catalog theo các tài liệu mình xem được (chỉ ghi phần thay đổi) */
let catSyncT = null;
function scheduleCatalogSync() { if (!canUp() || !loaded.items) return; clearTimeout(catSyncT); catSyncT = setTimeout(syncCatalog, 1500); }
async function syncCatalog() {
  if (!canUp()) return;
  const ops = [], want = {};
  for (const f of Object.values(items)) {
    if (f.locked || !f.access || f.cat === "cho" || levelOf(f) === "mat" || !CAT[f.cat] || !tree[f.parent]) continue;
    want[f.id] = catalogEntry(f);
  }
  for (const [id, e] of Object.entries(want)) if (JSON.stringify(catalog[id] || null) !== JSON.stringify(e)) ops.push({ type: "set", ref: doc(db, "pnd_catalog", id), data: e });
  const lv = myRole().levels, g = myGrant() || {}, cs = g.cats || ["*"];
  for (const [id, c] of Object.entries(catalog)) {
    if (want[id]) continue;
    const mine = isAdmin || ((cs.includes("*") || cs.includes(c.cat)) && lv.includes(c.access || DEFAULT_LEVEL));
    if (mine) ops.push({ type: "del", ref: doc(db, "pnd_catalog", id) });
  }
  if (!ops.length) return;
  try {
    await commitOps(ops);
    for (const o of ops) { const id = o.ref.id || o.ref.path.split("/").pop(); if (o.type === "del") delete catalog[id]; else catalog[id] = o.data; }
    console.info("Đã đồng bộ danh mục công khai: " + ops.length + " thay đổi.");
  } catch (e) { console.warn("đồng bộ danh mục công khai", e.message); }
}
const LOCAL_NOTES_KEY = "pnd_local_notes_v1";
function getLocalNotes() { try { return JSON.parse(localStorage.getItem(LOCAL_NOTES_KEY) || "{}"); } catch (e) { return {}; } }
function saveLocalNotes(map) { try { localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(map)); } catch (e) {} }
function putLocalNote(it) { const m = getLocalNotes(); m[it.id] = it; saveLocalNotes(m); }
function delLocalNote(id) { const m = getLocalNotes(); delete m[id]; saveLocalNotes(m); }

async function loadItems() {
  items = {};
  try {
    if (isAdmin) { (await getDocs(collection(db, "pnd_items"))).forEach(d => items[d.id] = d.data()); }
    else {
      // Truy vấn đúng phạm vi được phép để Quy tắc bảo mật Firestore chấp nhận
      const g = myGrant(), lv = myRole().levels;
      if (!g) (await getDocs(query(collection(db, "pnd_items"), where("access", "==", "cong-khai")))).forEach(d => items[d.id] = d.data());
      else {
        const cs = g.cats || ["*"];
        const keys = cs.includes("*") ? PUBLIC_CATS.map(c => c.key) : cs.filter(k => CAT[k] && !CAT[k].adminOnly);
        for (const k of keys) (await getDocs(query(collection(db, "pnd_items"), where("cat", "==", k), where("access", "in", lv)))).forEach(d => items[d.id] = d.data());
      }
    }
  } catch (e) {
    console.warn("items", e);
    // Phiên ẩn danh có thể vừa đổi (đăng nhập/thoát ở trang PN khác): ghi lại mã rồi thử một lần, không tự thoát
    if (e.code === "permission-denied" && session && !loadItems.retried) {
      loadItems.retried = true;
      try { await useCode(session.code); return loadItems(); } catch (x) { if (x.invalidCode) { toast(x.message + " Hãy nhập mã mới.", "err"); saveSession(null); } }
    }
  }
  loadItems.retried = false;
  await loadCatalog();
  const loc = getLocalNotes();
  const ghiChuRoot = catRootId("bst-ghi-chu");
  for (const [id, n] of Object.entries(loc)) {
    if (n && n._deleted) { delete items[id]; continue; }
    if (!items[id]) items[id] = { ...n, parent: tree[n.parent] ? n.parent : ghiChuRoot };
    else if (n.noteContent && (!items[id].noteContent || String(n.modified || "") > String(items[id].modified || ""))) {
      items[id] = { ...items[id], noteContent: n.noteContent, note: n.note || items[id].note, isNote: items[id].isNote || n.isNote, attachedNotes: n.attachedNotes || items[id].attachedNotes, noteTabs: n.noteTabs || items[id].noteTabs, notePage: n.notePage || items[id].notePage };
    }
  }
  loaded.items = true;
}

/* ---------- Cây thư mục ---------- */
const catRootId = key => (settings && settings.cats && settings.cats[key]) || (key === "bst-ghi-chu" ? "root-bst-ghi-chu" : null);
const childrenOf = id => Object.values(tree).filter(n => n.parent === id);
const filesOf = id => Object.values(items).filter(f => f.parent === id && canList(f));
function sortBySavedOrder(list, fallback) {
  if (list.some(x => Number.isFinite(x.order))) return list.sort((a, b) =>
    (Number.isFinite(a.order) ? a.order : 1e9) - (Number.isFinite(b.order) ? b.order : 1e9) || fallback(a, b));
  return list.sort(fallback);
}
function sortFolders(list) {
  const withYear = list.filter(n => yearOf(n.name)).length;
  const fallback = list.length && withYear >= Math.ceil(list.length / 2)
    ? (a, b) => (yearOf(b.name) - yearOf(a.name)) || vi.compare(a.name, b.name)
    : (a, b) => vi.compare(a.name, b.name);
  return sortBySavedOrder(list, fallback);
}
function sortFiles(list) {
  return sortBySavedOrder(list, (a, b) => String(b.issued || "").localeCompare(String(a.issued || "")) || (yearOf(b.name) - yearOf(a.name)) || vi.compare(a.name, b.name));
}
async function saveOrder(kind, parent, ids) {
  const batch = writeBatch(db);
  ids.forEach((id, order) => batch.set(doc(db, kind === "folder" ? "pnd_tree" : "pnd_items", id), { order }, { merge: true }));
  await batch.commit();
  ids.forEach((id, order) => { const target = kind === "folder" ? tree : items; if (target[id]) target[id].order = order; });
}
let dragItem = null;
function pathOf(id) { const out = []; let n = tree[id], guard = 0; while (n && guard++ < 20) { out.unshift(n); n = tree[n.parent]; } return out; }
function countFiles(id) { let n = filesOf(id).filter(canList).length; for (const c of childrenOf(id)) n += countFiles(c.id); return n; }

/* ---------- Giao diện chung ---------- */
function orderedKids(id) {
  const n = tree[id], cat = n && CAT[n.cat], kids = sortFolders(childrenOf(id));
  if (n && n.depth <= 1 && cat && cat.group && !kids.some(k => Number.isFinite(k.order))) {
    const order = Object.keys(cat.sub || {});
    kids.sort((a, b) => { const ia = order.indexOf(a.name), ib = order.indexOf(b.name); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || vi.compare(a.name, b.name); });
  }
  return kids;
}
function catCount(key) { const r = catRootId(key); return loaded.items && canBrowse(key) && r && tree[r] ? countFiles(r) : null; }
function renderNav() {
  const cur = currentCatKey(), h = decodeURIComponent(location.hash.slice(1));
  const curPath = h.startsWith("f/") ? pathOf(h.slice(2)).map(p => p.id) : [];
  let html = `<button type="button" class="cat home${!h ? " on" : ""}" data-home><span class="dot" style="background:var(--navy)"></span><span class="nm">Trang chủ</span></button>`;
  for (const c of visibleCats()) {
    const n = catCount(c.key);
    html += `<button type="button" class="cat${cur === c.key ? " on" : ""}" data-cat="${c.key}"><span class="dot" style="background:${c.color[0]}"></span><span class="nm">${esc(c.name)}</span>${n != null ? `<span class="n">${n}</span>` : ""}</button>`;
    const r = catRootId(c.key);
    if (cur === c.key && canBrowse(c.key) && r) {
      const kids = orderedKids(r);
      if (kids.length) html += `<div class="subnav">${kids.map(k => `<button type="button" class="sub${curPath.includes(k.id) ? " on" : ""}" data-folder="${esc(k.id)}"><span>${esc(k.name)}</span>${loaded.items ? `<span class="n">${countFiles(k.id)}</span>` : ""}</button>`).join("")}</div>`;
    }
  }
  if (isAdmin) html += `<button type="button" class="cat add" data-go="thu-muc/them-bst"><span class="nm">＋ Thêm bộ sưu tập</span></button>`;
  $("#catNav").innerHTML = html;
  renderSide();
}
function renderSide() {
  const mine = Object.values(items).filter(f => canSee(f) && f.cat !== "cho"), listed = Object.values(items).filter(f => canList(f) && f.cat !== "cho");
  const rows = [], g = myGrant(), r = myRole();
  rows.push(["Quyền của bạn", r.name]);
  if (g) {
    rows.push(["Tài liệu trong thư viện", loaded.items ? listed.length : "…"]);
    rows.push(["Tài liệu bạn mở được", loaded.items ? mine.length : "…"]);
    rows.push(["Số thư mục", Object.values(tree).filter(n => n.depth >= 2 && n.cat !== "cho" && canBrowse(n.cat)).length]);
    const cs = g.cats || ["*"];
    rows.push(["Danh mục được xem", cs.includes("*") ? PUBLIC_CATS.length : cs.filter(k => CAT[k]).length]);
    rows.push(["Mức được xem", r.levels.map(k => LV[k].name).join(", ")]);
    rows.push(["Tải tài liệu về", r.dl ? "Được phép" : "Không"]);
    if (isAdmin) {
      const drv = mine.filter(f => driveIdOf(f));
      rows.push(["Đã mở chia sẻ xem", drv.filter(f => f.shared !== false).length + "/" + drv.length]);
      const cho = Object.values(items).filter(f => f.cat === "cho").length;
      if (cho) rows.push(["Chờ phân loại", cho]);
    }
  } else rows.push(["Tài liệu trong thư viện", loaded.items ? listed.length : "…"], ["Tài liệu Công khai", loaded.items ? mine.length : "…"], ["Bộ sưu tập", PUBLIC_CATS.length]);
  $("#stats").innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("") +
    (!g ? `<dd class="muted" style="grid-column:1/-1;text-align:left;font-weight:400;margin-top:4px">Đang xem tài liệu Công khai. Đăng nhập để xem thêm tài liệu Nội bộ, Hạn chế. <button type="button" class="linkish" data-login>Đăng nhập</button></dd>` : "");
  const L = CFG.LINKS || {};
  const lk = (href, icon, colors, label) => href ? `<a href="${esc(href)}" target="_blank" rel="noopener"><span class="ic">${cover(icon, colors)}</span>${esc(label)}</a>` : "";
  $("#linkList").innerHTML = lk(L.pnl, "lib", ["#173f66", "#3c6ea3"], "PN Library") + lk(L.pnw, "cal", ["#1f527d", "#5c8fbf"], "PN Work") +
    lk(L.drive, "cloud", ["#2f6f4f", "#58a37a"], "Google Drive") + lk(L.gmail, "mail", ["#8e2c3f", "#c4566a"], "Gmail") +
    (isAdmin ? `<button type="button" data-go="tai-khoan"><span class="ic">${cover("key", ["#0f2945", "#2b5f8f"])}</span>Tài khoản & phân quyền</button>` : "");
}
function renderAuth() {
  document.body.classList.toggle("is-admin", isAdmin);
  document.body.classList.toggle("can-up", canUp());
  const g = myGrant(), r = myRole();
  const who = isAdmin ? (acct && acct.name ? acct.name : user && user.email || "Quản trị") : acct && grantOk(acct) ? (acct.name || acct.username) : session ? "Mã " + session.code : "";
  $("#whoami").textContent = who ? who + " · " + r.name : "";
  $("#btnLogout").hidden = !user || (user.isAnonymous && !session);
  $("#btnLogin").hidden = !!(isAdmin || (acct && grantOk(acct)));
  $("#btnPw").hidden = !(user && !user.isAnonymous && (user.providerData || []).some(p => p.providerId === "password"));
  if (!$("#btnScan").disabled) $("#adminNote").textContent = canUp() ? (settings ? (driveTok ? "Đã kết nối Drive" + (driveWho && driveWho.email ? " (" + driveWho.email + ")" : "") + (settings.lastScan ? " · quét lần cuối " + new Date(settings.lastScan).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "") + "." : "Drive sẽ tự kết nối lại khi bấm Quét hoặc Tải lên.") : "Chưa có cây thư mục: bấm Khởi tạo.") : "";
  $("#btnInit").hidden = !!settings || !isAdmin;
  void g;
}
function currentCatKey() {
  const h = location.hash.slice(1);
  if (h.startsWith("dm/")) return h.slice(3);
  if (h.startsWith("f/")) { const n = tree[decodeURIComponent(h.slice(2))]; return n ? n.cat : null; }
  return null;
}
function navRow() { return `<div class="nav-row"><button type="button" class="pill" data-back>QUAY LẠI</button><button type="button" class="pill" data-home>TRANG CHỦ</button></div>`; }

function route() {
  scheduleCatalogSync();
  const h = decodeURIComponent(location.hash.slice(1));
  const home = !h;
  $("#layout").classList.toggle("no-tools", !home);
  renderNav(); renderAuth();
  if (home) return renderHome();
  if (h.startsWith("dm/")) return renderCat(h.slice(3));
  if (h.startsWith("f/")) return renderFolder(h.slice(2));
  if (h.startsWith("tim/")) return renderSearch(h.slice(4));
  if (h === "tai-khoan") return renderAccounts();
  if (h === "thu-muc" || h === "thu-muc/them-bst") return renderFolders();
  location.hash = "";
}
const go = h => { if (location.hash.slice(1) === h) route(); else location.hash = h; };

/* ---------- Trang chủ ---------- */
function renderHome() {
  const stars = thongDung.filter(s => isAdmin || !CAT[s.cat] || !CAT[s.cat].adminOnly);
  const starDocs = stars.map(s => items[s.id]).filter(f => f && canList(f));
  const starHTML = starDocs.length
    ? `<div class="docs-grid">${starDocs.map(f => docCardHTML(f, true)).join("")}</div>`
    : stars.length
      ? `<div class="star-list">${stars.map(s => `<button type="button" class="star-item" data-star="${esc(s.id)}"><span class="st">★</span><span>${esc(s.name)}<small>${esc(CAT[s.cat] ? CAT[s.cat].name : "")}</small></span></button>`).join("")}</div>`
      : `<p class="empty">Tài liệu được đánh dấu ★ sẽ hiện ở đây.${isAdmin ? " (Đánh dấu khi tải lên hoặc bấm Sửa ở tài liệu.)" : ""}</p>`;
  const catCards = visibleCats().map(c => {
    const n = catCount(c.key);
    return `<div class="card-wrap"><button type="button" class="card" data-cat="${c.key}"><span class="cv">${cover(c.icon, c.color)}</span><span class="nm">${esc(c.name)}</span></button></div>`;
  }).join("");
  const recent = loaded.items
    ? Object.values(items).filter(f => canList(f) && f.cat !== "cho").sort((a, b) => String(b.added || b.modified || "").localeCompare(String(a.added || a.modified || ""))).slice(0, 10)
    : [];
  $("#main").innerHTML = `
    <section class="box"><h2 class="box-title">Thông dụng ★</h2>${starHTML}</section>
    <section class="box"><h2 class="box-title">Danh mục thư viện</h2><div class="cards">${catCards}</div></section>
    ${recent.length ? `<section class="box"><h2 class="box-title">Mới cập nhật</h2><div class="docs-grid">${recent.map(f => docCardHTML(f, true)).join("")}</div></section>` : ""}`;
}

/* ---------- Trang danh mục & thư mục ---------- */
function requireAccess(key) {
  if (canBrowse(key)) return true;
  $("#main").innerHTML = `<section class="box"><h2 class="box-title">${esc(CAT[key] ? CAT[key].title : "")}</h2>
    <p class="empty">Tài khoản của bạn chưa được cấp quyền xem danh mục <b>${esc(CAT[key] ? CAT[key].name : key)}</b>. Liên hệ quản trị viên để được mở quyền.</p>${navRow()}</section>`;
  return false;
}
function folderTools(id) {
  return canUp() && tree[id] && tree[id].depth >= 2 ? `<span class="ftools"><button type="button" title="Thêm/đổi ảnh bìa" data-fimg="${esc(id)}">▧</button><button type="button" title="Đổi tên" data-fren="${esc(id)}">✎</button><button type="button" title="Xóa thư mục" data-fdel="${esc(id)}">🗑</button></span>` : "";
}
function cardHTML(n, cat) {
  const cnt = null;
  const y = yearOf(n.name);
  const real = tree[n.id] && tree[n.id].name === n.name;
  return `<div class="card-wrap" draggable="${canUp() ? "true" : "false"}" data-sort-kind="folder" data-sort-id="${esc(n.id)}" data-sort-parent="${esc(n.parent || "")}"><button type="button" class="card" data-folder="${esc(n.id)}"><span class="cv">${n.imageUrl ? `<img src="${esc(n.imageUrl)}" alt="Ảnh ${esc(n.name)}" loading="lazy" referrerpolicy="no-referrer">` : cover(cat.icon, cat.color, y ? String(y) : "")}</span><span class="nm">${esc(n.name)}</span></button>${real ? folderTools(n.id) : ""}</div>`;
}
const upBtn = parent => canUp() ? `<button type="button" class="add-folder up" data-upload="${esc(parent)}">⤒ Tải tài liệu lên</button>` : "";
const addBtn = (parent, label) => canUp() ? `<button type="button" class="add-folder" data-fnew="${esc(parent)}">＋ ${esc(label)}</button>` : "";
function noteCreateBoxHTML(folderId, catKey) {
  const isNoteCat = catKey === "bst-ghi-chu";
  return `<div class="note-create-box" id="noteCreateBox"${isNoteCat ? "" : " hidden"}>
    <div class="note-create-head">
      <h3>📝 TẠO VĂN BẢN BẰNG GHI CHÚ &amp; SOẠN THẢO TRỰC TIẾP TRONG FILE</h3>
      <span class="muted">Soạn thảo trực tiếp trong file được tạo ra · Lưu lại &amp; chuyển vào file hoặc thư mục cụ thể</span>
    </div>
    <div class="note-create-row">
      <input id="quickNoteName" type="text" placeholder="Nhập tiêu đề văn bản / ghi chú mới (VD: Dự thảo công văn, Biên bản họp, Ghi chú chuyên đề...)" autocomplete="off">
      <select id="quickNoteTpl" aria-label="Mẫu văn bản">
        <option value="blank">📄 Văn bản trống</option>
        <option value="congvan">🏛 Mẫu Công văn / Hành chính</option>
        <option value="bienban">📋 Mẫu Biên bản làm việc</option>
        <option value="nghiencuu">🔬 Phiếu ghi chú nghiên cứu</option>
      </select>
      <button type="button" data-quicknote="${esc(folderId)}">＋ Tạo file &amp; Soạn thảo ngay</button>
    </div>
  </div>`;
}
function renderCat(key) {
  if (!CAT[key] && !loaded.tree) { $("#main").innerHTML = `<section class="box"><p class="empty">Đang tải danh mục…</p></section>`; return; }
  const cat = CAT[key]; if (!cat || (cat.adminOnly && !isAdmin)) { go(""); return; }
  if (!requireAccess(key)) return;
  let rootId = catRootId(key);
  if (key === "bst-ghi-chu" && rootId && !tree[rootId]) {
    tree[rootId] = { id: rootId, name: cat.name || "Ghi chú", parent: (settings && settings.rootId) || "root", cat: "bst-ghi-chu", depth: 1 };
  }
  if (!rootId) { $("#main").innerHTML = `<section class="box"><h2 class="box-title">${esc(cat.title)}</h2><p class="empty">Danh mục đang được chuẩn bị.${isAdmin ? " Bấm “Khởi tạo cây thư mục” ở trang chủ." : ""}</p>${navRow()}</section>`; return; }
  renderFolder(rootId, true);
}
const guestNote = () => myGrant() ? "" : `<p class="note-bar">Bạn đang xem tài liệu <b>Công khai</b>. <button type="button" class="linkish" data-login>Đăng nhập</button> để xem thêm tài liệu Nội bộ và Hạn chế.</p>`;
function renderFolder(id, isCatRoot) {
  const node = tree[id];
  if (!node) { $("#main").innerHTML = `<section class="box"><p class="empty">${loaded.tree ? "Không tìm thấy thư mục này (có thể đã đổi tên hoặc chuyển chỗ)." : "Đang tải…"}</p>${navRow()}</section>`; return; }
  const cat = CAT[node.cat] || CAT.khac;
  if (!requireAccess(cat.key)) return;
  const path = pathOf(id);
  const kids = sortFolders(childrenOf(id));
  let title = node.depth <= 1 ? cat.title : (!cat.group && node.depth === 2 ? cat.title + " " + node.name.toUpperCase() : node.name.toUpperCase());
  let body = "";
  if (node.depth <= 1 && cat.group) {
    const order = Object.keys(cat.sub || {});
    kids.sort((a, b) => { const ia = order.indexOf(a.name), ib = order.indexOf(b.name); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || vi.compare(a.name, b.name); });
    body = kids.map(g => {
      const gk = sortFolders(childrenOf(g.id));
      const own = filesOf(g.id).length;
      const cards = gk.map(n => cardHTML(n, cat)).join("") + (own ? cardHTML({ id: g.id, name: "Tài liệu chung" }, cat) : "");
      return `<div class="grp-head"><div class="grp-title">${esc(g.name)}</div>${folderTools(g.id)}</div>${cards || canUp() ? `<div class="cards">${cards}${addBtn(g.id, "Thư mục mới")}</div>` : `<p class="muted">Chưa có tài liệu.</p>`}`;
    }).join("") + (canUp() ? `<div style="margin-top:14px">${addBtn(id, "Nhóm mới")}</div>` : "");
  } else if (kids.length || canUp()) {
    body = `<div class="cards">${kids.map(n => cardHTML(n, cat)).join("")}${addBtn(id, "Thư mục mới")}${node.depth >= 2 ? upBtn(id) : ""}</div>`;
  }
  const files = sortFiles(filesOf(id));
  if (files.length) body += (body ? `<div class="grp-title" style="margin-top:20px">Danh sách tài liệu</div>` : "") + tableHTML(files, false);
  if (!body) body = `<p class="empty">${loaded.items ? "Chưa có tài liệu trong mục này. Bấm “＋ Tạo file & Soạn thảo ngay” để tạo văn bản ghi chú mới." : "Đang tải danh mục…"}</p>`;
  const crumbs = `<div class="crumbs"><a data-home>Trang chủ</a>${path.map((p, i) => `<span class="sep">/</span>` + (i === path.length - 1 ? `<span>${esc(i === 0 ? cat.name : p.name)}</span>` : `<a data-folder="${esc(p.id)}">${esc(i === 0 ? cat.name : p.name)}</a>`)).join("")}</div>`;
  const noteBtn = `<button type="button" class="hl" style="background:#b45309;border-color:#b45309" data-togglenote="${esc(id)}">📝 Tạo văn bản bằng ghi chú</button>`;
  const tools = canUp() && node.depth <= 1
    ? `<div class="page-tools">${noteBtn}<button type="button" class="hl" data-upload="${esc(id)}">⤒ Tải tài liệu lên</button><button type="button" data-flevel="${esc(id)}">🔒 Mức truy cập</button><button type="button" data-go="thu-muc">Quản lý thư mục</button></div>`
    : canUp() && node.depth >= 2
      ? `<div class="page-tools">${noteBtn}<button type="button" class="hl" data-upload="${esc(id)}">⤒ Tải tài liệu lên đây</button><button type="button" data-flevel="${esc(id)}">🔒 Mức truy cập</button><button type="button" data-fren="${esc(id)}">✎ Đổi tên thư mục</button><button type="button" data-movefolder="${esc(id)}">⇄ Chuyển sang danh mục khác</button><button type="button" data-fdel="${esc(id)}">🗑 Xóa thư mục</button></div>`
      : `<div class="page-tools">${noteBtn}</div>`;
  $("#main").innerHTML = `<section class="box${canUp() ? " dropzone" : ""}" data-dropfolder="${esc(id)}"><h2 class="box-title">${esc(title)}${canUp() ? " " + lvChip(folderLevel(id), tree[id].access ? "" : " · kế thừa") : ""}</h2>${crumbs}${guestNote()}${tools}${noteCreateBoxHTML(id, cat.key)}${body}${canUp() ? '<p class="drop-hint">Mẹo: kéo thả tệp từ máy tính vào khung này để tải lên. Kéo một tài liệu hoặc thư mục thả vào giữa thẻ thư mục khác (hoặc vào tên thư mục ở cột trái) để chuyển vào đó; thả vào mép thẻ để đổi thứ tự.</p>' : ""}${navRow()}</section>`;
}
let imageTargetFolder = null;
function setFolderImage(id) {
  if (!canUp() || !tree[id]) return;
  imageTargetFolder = id;
  $("#imageSaveBtn").disabled = true;
  $("#imageSaveBtn").onclick = null;
  $("#imageFileInput").value = "";
  $("#imagePasteArea").textContent = "";
  $("#imagePasteArea").innerHTML = "<strong>DÁN ẢNH VÀO ĐÂY</strong><span>Sao chép ảnh rồi nhấn Ctrl+V, hoặc chọn ảnh từ máy bên dưới.</span>";
  const d = $("#dlgImage"), preview = $("#imagePreview");
  const current = tree[id].imageUrl || "";
  preview.innerHTML = current ? `<img src="${esc(current)}" alt="Ảnh bìa hiện tại">` : "Chưa có ảnh bìa";
  $("#imagePasteStatus").textContent = "Bấm vào vùng bên dưới rồi nhấn Ctrl+V để dán ảnh đã sao chép.";
  d.showModal();
  $("#imagePasteArea").focus();
}
async function savePastedFolderImage(file) {
  const id = imageTargetFolder;
  if (!canUp() || !id || !tree[id]) return;
  if (!file || !file.type.startsWith("image/")) { toast("Clipboard chưa có dữ liệu ảnh hợp lệ.", "err"); return; }
  if (file.size > 12 * 1024 * 1024) { toast("Ảnh vượt quá 12 MB. Hãy giảm dung lượng trước khi dán.", "err"); return; }
  const status = $("#imagePasteStatus"), btn = $("#imageSaveBtn");
  btn.disabled = true; status.textContent = "Đang tải ảnh lên Google Drive…";
  try {
    const { url, id: fileId } = await uploadImage(file, "Anh-bia-" + id.slice(0, 8));
    const uploaded = { id: fileId };
    await setDoc(doc(db, "pnd_tree", id), { imageUrl: url, imageFileId: uploaded.id }, { merge: true });
    tree[id].imageUrl = url; tree[id].imageFileId = uploaded.id;
    status.textContent = "Đã lưu ảnh bìa. Có thể đóng cửa sổ.";
    $("#imagePreview").innerHTML = `<img src="${esc(url)}" alt="Ảnh bìa mới">`;
    toast("Đã cập nhật ảnh bìa thư mục.", "ok");
    await logAct("FOLDER_IMAGE", tree[id].name);
  } catch (e) {
    status.textContent = "Không lưu được ảnh: " + (e.message || e);
    toast("Không lưu được ảnh bìa: " + (e.message || e), "err");
  } finally { btn.disabled = false; }
}

function noteHTML(f) {
  const l = [];
  if (f.issuer || f.issued || f.number) l.push("Được ban hành" + (f.issued ? " ngày " + fmtDate(f.issued) : "") + (f.issuer ? " bởi " + esc(f.issuer) : "") + (f.number ? " (số " + esc(f.number) + ")" : ""));
  if (f.effective) l.push("Có hiệu lực kể từ " + fmtDate(f.effective));
  if (f.status) l.push(`<span class="${/^Còn/.test(f.status) ? "stat-on" : /Hết/.test(f.status) ? "stat-off" : ""}">${esc(f.status)}</span>`);
  if (f.note) l.push(esc(f.note));
  if (!l.length && f.modified) l.push('<span class="muted">Cập nhật ' + fmtDate(String(f.modified).slice(0, 10)) + "</span>");
  return l.join("<br>");
}
/* ---------- Danh sách tài liệu: bộ lọc, dạng lưới (bìa sách), dạng danh sách ---------- */
let filt = { year: "", fmt: "", status: "", sort: "" };
let view = (() => { try { return localStorage.getItem("pnd_view") || "grid"; } catch (e) { return "grid"; } })();
function applyFilt(list) {
  let out = list.filter(f => (!filt.year || String(yearOfItem(f)) === filt.year) && (!filt.fmt || fmtOf(f) === filt.fmt) && (!filt.status || (filt.status === "-" ? !f.status : f.status === filt.status)));
  const recentKey = f => String(f.added || f.modified || "");
  if (filt.sort === "moi") out.sort((a, b) => recentKey(b).localeCompare(recentKey(a)));
  else if (filt.sort === "ban-hanh") out.sort((a, b) => String(b.issued || "").localeCompare(String(a.issued || "")) || yearOfItem(b) - yearOfItem(a));
  else if (filt.sort === "ten") out.sort((a, b) => vi.compare(a.name, b.name));
  else out = sortFiles(out);
  return out;
}
const sortAttrs = (f, noSort) => `draggable="${canUp() && !f.locked && !noSort && !filt.sort ? "true" : "false"}" data-sort-kind="file" data-sort-id="${esc(f.id)}" data-sort-parent="${esc(f.parent || "")}"`;
function metaLine(f) {
  const y = yearOfItem(f), p = [];
  if (f.number) p.push(`<span>${esc(f.number)}</span>`); else if (y) p.push(`<span>Năm ${y}</span>`);
  if (f.status) p.push(`<span class="st-chip ${stCls(f.status)}">${esc(f.status)}</span>`);
  return p.join("");
}
function admBtns(f) {
  if (f.locked) return "";
  if (!canUp() && !f.isLocalNote && !f.isNote) return "";
  return `<div class="doc-adm">${canUp() ? `<button type="button" data-edit="${esc(f.id)}">Sửa</button><button type="button" data-move="${esc(f.id)}">Chuyển</button>` : `<button type="button" data-doc="${esc(f.id)}">Soạn thảo</button>`}<button type="button" data-del="${esc(f.id)}" title="Xóa file">Xóa</button></div>` +
    (canUp() && driveIdOf(f) && f.shared === false ? '<div class="sh-warn">Chưa mở chia sẻ xem</div>' : "");
}
function docCardHTML(f, noSort) {
  return `<article class="doc-card${f.locked ? " locked" : ""}" ${sortAttrs(f, noSort)}>${f.star ? '<span class="badge-star" title="Thông dụng">★</span>' : ""}<div class="doc-cover" data-doc="${esc(f.id)}" title="Xem chi tiết">${bookHTML(f)}</div><button type="button" class="doc-title" data-doc="${esc(f.id)}" title="${esc(f.name)}">${esc(f.name)}</button><div class="doc-meta">${metaLine(f)}${f.hit ? '<span class="muted">khớp nội dung</span>' : ""}</div><button type="button" class="btn-detail" data-doc="${esc(f.id)}">${f.locked ? "🔒 Chi tiết" : (f.isNote || fmtOf(f) === "note" ? "✎ Mở & Soạn thảo" : "Chi tiết")}</button>${admBtns(f)}</article>`;
}
function rowHTML(f, withPath) {
  const notes = noteHTML(f), k = fmtOf(f);
  return `<div class="doc-row" ${sortAttrs(f)}><div class="doc-cover" data-doc="${esc(f.id)}">${bookHTML(f)}</div>
    <div><h4 data-doc="${esc(f.id)}">${f.star ? "★ " : ""}${esc(f.name)}</h4><div class="doc-meta"><span>${FMT[k][0]}${f.size ? " · " + fmtSize(f.size) : ""}</span>${f.hit ? '<span class="muted">khớp nội dung</span>' : ""}</div>${notes ? `<p class="doc-note">${notes}</p>` : ""}${withPath ? `<div class="doc-path"><a data-folder="${esc(f.parent)}">${esc(pathOf(f.parent).map(p => p.name).join(" › "))}</a></div>` : ""}</div>
    <div class="acts"><button type="button" class="btn-detail" data-doc="${esc(f.id)}">${f.locked ? "🔒 Chi tiết" : (f.isNote || k === "note" ? "✎ Mở &amp; Soạn thảo" : "Chi tiết &amp; Xem")}</button>${f.link && !f.isNote && (canDl() || !driveIdOf(f)) ? `<a class="btn" style="text-align:center;text-decoration:none" href="${esc(f.link)}" target="_blank" rel="noopener">${driveIdOf(f) ? "Mở tệp" : "Mở liên kết"}</a>` : ""}${admBtns(f)}</div></div>`;
}
function tableHTML(files, withPath) {
  const years = [...new Set(files.map(yearOfItem).filter(Boolean))].sort((a, b) => b - a);
  const fmts = new Set(files.map(fmtOf)), stats = [...new Set(files.map(f => f.status).filter(Boolean))];
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
  const shown = applyFilt(files);
  const any = filt.year || filt.fmt || filt.status || filt.sort;
  const bar = `<div class="filters">
    <label>Năm: <select data-filt="year">${opt("", "Tất cả năm", filt.year)}${years.map(y => opt(y, y, filt.year)).join("")}</select></label>
    <label>Định dạng: <select data-filt="fmt">${opt("", "Tất cả tệp", filt.fmt)}${Object.keys(FMT).filter(k => fmts.has(k) || filt.fmt === k).map(k => opt(k, FMT[k][0], filt.fmt)).join("")}</select></label>
    <label>Hiệu lực: <select data-filt="status">${opt("", "Tất cả", filt.status)}${stats.map(s => opt(s, s, filt.status)).join("")}${opt("-", "Chưa ghi", filt.status)}</select></label>
    <label>Sắp xếp: <select data-filt="sort">${opt("", "Theo thứ tự thư mục", filt.sort)}${opt("ban-hanh", "Ngày ban hành mới nhất", filt.sort)}${opt("moi", "Mới cập nhật", filt.sort)}${opt("ten", "Tên A – Z", filt.sort)}</select></label>
    <span class="sp"></span>
    ${any ? '<button type="button" class="linkish" data-freset>Đặt lại</button>' : ""}
    <span class="view-tg" role="group" aria-label="Cách hiển thị"><button type="button" data-view="grid" class="${view === "grid" ? "on" : ""}">▦ Lưới</button><button type="button" data-view="list" class="${view === "list" ? "on" : ""}">☰ Danh sách</button></span>
  </div>`;
  const body = !shown.length ? `<p class="empty">Không có tài liệu khớp bộ lọc.</p>`
    : view === "list" ? `<div class="docs-list">${shown.map(f => rowHTML(f, withPath)).join("")}</div>`
    : `<div class="docs-grid">${shown.map(f => docCardHTML(f)).join("")}</div>`;
  return bar + `<div class="count-line">Tìm được <b>${shown.length}</b> tài liệu</div>` + body;
}

/* ---------- Tạo văn bản bằng ghi chú, Soạn thảo trong file, Chuyển file & Xóa file ---------- */
let currentOpenDocId = null;
let currentDocMode = "view"; // "view" | "edit"

function buildNoteTemplate(tpl, title) {
  const nowStr = fmtDate(todayISO());
  const safeTitle = esc(title || "Văn bản ghi chú mới");
  if (tpl === "congvan") {
    return `<table style="width:100%;border:0;margin-bottom:14px"><tr><td style="border:0;text-align:center;width:45%;vertical-align:top"><b>ĐƠN VỊ / CƠ QUAN CHỦ QUẢN</b><br><b>TÊN ĐƠN VỊ BAN HÀNH</b><br>Số: … / …</td><td style="border:0;text-align:center;width:55%;vertical-align:top"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b>Độc lập - Tự do - Hạnh phúc</b><br><i>…, ngày ${nowStr}</i></td></tr></table><h2 style="text-align:center;margin:14px 0 6px">${safeTitle.toUpperCase()}</h2><p style="text-align:center"><b>Kính gửi:</b> …………………………………………………………</p><p>1. Nội dung triển khai: …………………………………………………………………………………………</p><p>2. Đề xuất / Kiến nghị: …………………………………………………………………………………………</p>`;
  }
  if (tpl === "bienban") {
    return `<h2 style="text-align:center;margin:0 0 6px">BIÊN BẢN LÀM VIỆC / HỌP</h2><p style="text-align:center"><b>Chủ đề: ${safeTitle}</b></p><p><b>1. Thời gian:</b> Ngày ${nowStr}</p><p><b>2. Thành phần tham dự:</b> …………………………………………………………………………</p><p><b>3. Nội dung trao đổi:</b></p><ul><li>Nội dung 1: ……………………………………………………………………………………</li><li>Nội dung 2: ……………………………………………………………………………………</li></ul><p><b>4. Kết luận / Phân công thực hiện:</b></p><table><thead><tr><th>STT</th><th>Nội dung công việc</th><th>Người phụ trách</th><th>Thời hạn</th></tr></thead><tbody><tr><td>1</td><td>…</td><td>…</td><td>…</td></tr><tr><td>2</td><td>…</td><td>…</td><td>…</td></tr></tbody></table>`;
  }
  if (tpl === "nghiencuu") {
    return `<h2 style="margin:0 0 8px">PHIẾU GHI CHÚ NGHIÊN CỨU: ${safeTitle}</h2><p><b>Ngày lập:</b> ${nowStr} · <b>Chuyên đề / Hồ sơ:</b> ………………………………</p><hr><h3>I. Tóm tắt nội dung cốt lõi</h3><p>• Ý chính 1: …………………………………………………………………………………………</p><h3>II. Trích dẫn / Căn cứ pháp lý - học liệu</h3><blockquote>“Ghi nhận điều khoản, trích dẫn hoặc số hiệu văn bản liên quan tại đây…”</blockquote><h3>III. Ghi chú áp dụng &amp; Hướng xử lý</h3><p>☐ Việc cần thực hiện 1</p><p>☐ Việc cần thực hiện 2</p>`;
  }
  return `<h2 style="margin-top:0">${safeTitle}</h2><p><i>Ngày tạo: ${nowStr}</i></p><p>Nhập nội dung soạn thảo văn bản / ghi chú trực tiếp tại đây…</p>`;
}

function stripHtmlText(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || d.innerText || "").replace(/\s+/g, " ").trim();
}

async function createNoteDocument(folderId, customTitle, tpl, htmlOverride) {
  let targetFolder = folderId && tree[folderId] ? folderId : catRootId("bst-ghi-chu");
  if (!targetFolder || !tree[targetFolder]) {
    const gcRoot = catRootId("bst-ghi-chu") || "root-bst-ghi-chu";
    if (!tree[gcRoot]) tree[gcRoot] = { id: gcRoot, name: (CAT["bst-ghi-chu"] && CAT["bst-ghi-chu"].name) || "Ghi chú", parent: (settings && settings.rootId) || "root", cat: "bst-ghi-chu", depth: 1 };
    targetFolder = gcRoot;
  }
  const nameIn = (customTitle != null ? customTitle : (($("#quickNoteName") || {}).value || "")).trim();
  const tplIn = tpl || (($("#quickNoteTpl") || {}).value || "blank");
  const title = nameIn || ("Văn bản ghi chú - " + fmtDate(todayISO()) + " " + new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
  const htmlContent = htmlOverride || buildNoteTemplate(tplIn, title);
  const plainSummary = stripHtmlText(htmlContent).slice(0, 240);
  const now = new Date().toISOString();
  const node = tree[targetFolder];
  const catKey = (node && node.cat) || "bst-ghi-chu";
  const accessLv = canUp() ? folderLevel(targetFolder) : "cong-khai";
  const id = "note-" + rid();
  const newItem = {
    id,
    name: title,
    mime: "link",
    fmime: "text/html",
    isNote: true,
    isLocalNote: !canUp(),
    link: "#doc/" + id,
    cat: catKey,
    parent: targetFolder,
    access: accessLv,
    issued: todayISO(),
    added: now,
    modified: now,
    status: "Còn hiệu lực",
    note: plainSummary,
    noteContent: htmlContent,
    size: new Blob([htmlContent]).size,
    shared: true
  };
  items[id] = newItem;
  putLocalNote(newItem);
  if (canUp()) {
    try {
      await setDoc(doc(db, "pnd_items", id), newItem);
      scheduleCatalogSync();
      await logAct("NOTE_NEW", title);
    } catch (e) { console.warn("Lưu ghi chú lên Firestore:", e.message); }
  }
  if ($("#quickNoteName")) $("#quickNoteName").value = "";
  toast("Đã tạo file văn bản ghi chú “" + title + "”. Mời bạn soạn thảo trực tiếp!", "ok");
  route();
  openDoc(id, "edit");
}

function allDocOptions(excludeId) {
  const list = Object.values(items).filter(x => x && x.id !== excludeId && canList(x));
  list.sort((a, b) => vi.compare(a.name || "", b.name || ""));
  if (!list.length) return `<option value="">-- Chưa có tài liệu đích nào khác --</option>`;
  return `<option value="">-- Chọn file (tài liệu) cụ thể để chuyển vào (${list.length} file) --</option>` +
    list.map(x => {
      const catName = CAT[x.cat] ? CAT[x.cat].name : x.cat;
      return `<option value="${esc(x.id)}">${esc(x.name)} [${esc(catName)}]</option>`;
    }).join("");
}

/* ---------- Trình soạn thảo kiểu Word: trang giấy, ribbon, nhiều mục (tab) trong một file ---------- */
// Một file ghi chú có thể chia thành nhiều MỤC (như tab của Google Docs). Dữ liệu: f.noteTabs = [{id, title, html}],
// f.notePage = {size, orient, margin}. f.noteContent luôn giữ bản gộp (để tìm kiếm, tóm tắt, tương thích dữ liệu cũ).
const PAGE_SIZES = { A4: [210, 297, "A4 (21 × 29,7 cm)"], A5: [148, 210, "A5 (14,8 × 21 cm)"], Letter: [215.9, 279.4, "Letter (21,6 × 27,9 cm)"] };
const MARGINS = {
  nd30: { t: 20, b: 20, l: 30, r: 15, name: "Văn bản hành chính (trên 2 · dưới 2 · trái 3 · phải 1,5 cm)" },
  normal: { t: 25.4, b: 25.4, l: 25.4, r: 25.4, name: "Thường (2,54 cm mỗi lề)" },
  moderate: { t: 25.4, b: 25.4, l: 19.1, r: 19.1, name: "Vừa (trên/dưới 2,54 · trái/phải 1,91 cm)" },
  narrow: { t: 12.7, b: 12.7, l: 12.7, r: 12.7, name: "Hẹp (1,27 cm mỗi lề)" }
};
const W_FONTS = ["Times New Roman", "Arial", "Calibri", "Cambria", "Tahoma", "Verdana", "Georgia", "Courier New"];
const W_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const MM = 96 / 25.4;
// Kiểu chữ dùng chung cho trang soạn thảo và file xuất (để file Word ra giống hệt màn hình)
const WORD_CSS = `body{font-family:"Times New Roman",serif;font-size:14pt;line-height:1.5;color:#000}
h1,h2,h3,td,th,li{font-family:"Times New Roman",serif}
p{margin:0 0 6pt}h1{font-size:16pt;font-weight:bold;margin:12pt 0 6pt}h2{font-size:14pt;font-weight:bold;margin:12pt 0 6pt}h3{font-size:14pt;font-weight:bold;font-style:italic;margin:10pt 0 4pt}
blockquote{margin:6pt 0 6pt 1cm;padding-left:8pt;border-left:2pt solid #999;font-style:italic}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:3pt 6pt;vertical-align:top}th{font-weight:bold}
ul,ol{margin:0 0 6pt}.note-summary{border-left:3pt solid #7c3aed;padding:4pt 8pt;background:#f5f3ff}`;
let ed = null; // trạng thái trình soạn thảo đang mở

function notePageOf(f) {
  const p = { size: "A4", orient: "portrait", margin: "nd30", ...((f && f.notePage) || {}) };
  if (!PAGE_SIZES[p.size]) p.size = "A4";
  if (!MARGINS[p.margin]) p.margin = "nd30";
  if (p.orient !== "landscape") p.orient = "portrait";
  return p;
}
function pageDims(p) { let [w, h] = PAGE_SIZES[p.size]; if (p.orient === "landscape") [w, h] = [h, w]; return { w, h, m: MARGINS[p.margin] }; }
function noteTabsOf(f) {
  if (Array.isArray(f.noteTabs) && f.noteTabs.length) return f.noteTabs.map((t, i) => ({ id: t.id || "t-" + rid(), title: t.title || ("Mục " + (i + 1)), html: t.html || "" }));
  const html = f.noteContent || `<h2 style="margin-top:0">${esc(f.name)}</h2><p>${esc(f.note || "Nhập nội dung văn bản / ghi chú trực tiếp tại đây…")}</p>`;
  return [{ id: "t-" + rid(), title: "Mục 1", html }];
}
function joinTabs(tabs) {
  if (tabs.length === 1) return tabs[0].html;
  return tabs.map(t => `<h1 class="tab-head">${esc(t.title)}</h1>${t.html}`).join('<div class="pg-break"></div>');
}
const wSheet = () => $("#inFileSheet");
const wOpts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`).join("");

function inFileEditorHTML(f, hasOriginalView) {
  ed = { id: f.id, tabs: noteTabsOf(f), active: 0, page: notePageOf(f), zoom: 1, range: null, ro: null };
  const p = ed.page;
  return `<div class="infile-wrap word${window.innerWidth < 820 ? " no-tabs" : ""}" id="inFileWrap">
    <div class="infile-mode-bar">
      <div class="infile-mode-tabs">
        ${hasOriginalView ? `<button type="button" class="infile-tab" data-docmode="view">👁 Xem tài liệu gốc</button>` : ""}
        <button type="button" class="infile-tab on" data-docmode="edit">✎ Soạn thảo</button>
      </div>
      <input id="inFileTitleInput" class="w-title" type="text" value="${esc(f.name)}" placeholder="Tên file văn bản…" aria-label="Tên file văn bản">
      <div style="display:flex;align-items:center;gap:8px">
        <span id="inFileSaveStatus" style="font-size:12px;color:#fde68a">Sẵn sàng soạn thảo</span>
        <button type="button" class="btn green sm" data-notesave="${esc(f.id)}" style="background:#16a34a;border-color:#15803d;color:#fff;padding:5px 12px">💾 Lưu (Ctrl+S)</button>
      </div>
    </div>
    <div class="rb-tabs" role="tablist">
      <button type="button" class="rb-pane" data-wpane title="Ẩn / hiện danh sách mục trong file">☰ Mục</button>
      <button type="button" data-wrtab="file">Tệp</button>
      <button type="button" class="on" data-wrtab="home">Trang chủ</button>
      <button type="button" data-wrtab="insert">Chèn</button>
      <button type="button" data-wrtab="layout">Bố cục</button>
    </div>
    <div class="ribbon">
      <div class="rb-panel infile-toolbar" data-rpanel="file" hidden>
        <div class="rb-grp"><div class="rb-row">
          <button type="button" data-notesave="${esc(f.id)}">💾 Lưu</button>
          <button type="button" data-exportdoc="${esc(f.id)}" title="Xuất toàn bộ file, mỗi mục sang trang mới">📘 Xuất Word – cả file</button>
          <button type="button" data-wexporttab="${esc(f.id)}" title="Chỉ xuất mục đang mở">📘 Xuất Word – mục đang mở</button>
          <button type="button" data-exporttxt="${esc(f.id)}">📄 Xuất .txt</button>
          <button type="button" data-printnote="${esc(f.id)}">🖨 In / Lưu PDF</button>
        </div><span class="rb-lbl">Lưu &amp; xuất file</span></div>
        <div class="rb-grp"><div class="rb-row">
          <button type="button" data-wtransfer>⇄ Chuyển vào file / thư mục</button>
          <button type="button" data-winfo>ⓘ Thông tin tài liệu</button>
        </div><span class="rb-lbl">Sắp xếp</span></div>
      </div>
      <div class="rb-panel infile-toolbar" data-rpanel="home">
        <div class="rb-grp"><div class="rb-row">
          <button type="button" data-wcmd="undo" title="Hoàn tác (Ctrl+Z)">↶</button>
          <button type="button" data-wcmd="redo" title="Làm lại (Ctrl+Y)">↷</button>
        </div><span class="rb-lbl">Hoàn tác</span></div>
        <div class="rb-grp"><div class="rb-row">
          <select data-wfont aria-label="Phông chữ" style="width:150px">${wOpts(W_FONTS.map(x => [x, x]), "Times New Roman")}</select>
          <select data-wsize aria-label="Cỡ chữ" style="width:62px">${wOpts(W_SIZES.map(x => [x, x]), 14)}</select>
        </div><div class="rb-row">
          <button type="button" data-wcmd="bold" title="In đậm (Ctrl+B)"><b>B</b></button>
          <button type="button" data-wcmd="italic" title="In nghiêng (Ctrl+I)"><i>I</i></button>
          <button type="button" data-wcmd="underline" title="Gạch chân (Ctrl+U)"><u>U</u></button>
          <button type="button" data-wcmd="strikeThrough" title="Gạch ngang"><s>S</s></button>
          <button type="button" data-wcmd="superscript" title="Chỉ số trên">x²</button>
          <button type="button" data-wcmd="subscript" title="Chỉ số dưới">x₂</button>
          <label class="w-color" title="Màu chữ"><span style="border-bottom:3px solid #c00000">A</span><input type="color" data-wcolor value="#c00000"></label>
          <label class="w-color" title="Tô nền chữ"><span style="background:#fff200;padding:0 3px">ab</span><input type="color" data-whilite value="#fff200"></label>
          <button type="button" data-wcmd="removeFormat" title="Xóa định dạng">⌫</button>
        </div><span class="rb-lbl">Phông chữ</span></div>
        <div class="rb-grp"><div class="rb-row">
          <button type="button" data-wcmd="insertUnorderedList" title="Danh sách gạch đầu dòng">• ≡</button>
          <button type="button" data-wcmd="insertOrderedList" title="Danh sách đánh số">1. ≡</button>
          <button type="button" data-wcmd="outdent" title="Giảm thụt lề">⇤</button>
          <button type="button" data-wcmd="indent" title="Tăng thụt lề">⇥</button>
          <button type="button" data-wfirst title="Thụt đầu dòng 1 cm cho đoạn đang chọn (bấm lần nữa để bỏ)">↦ Đầu dòng</button>
        </div><div class="rb-row">
          <button type="button" data-wcmd="justifyLeft" title="Căn trái (Ctrl+L)">⯇ Trái</button>
          <button type="button" data-wcmd="justifyCenter" title="Căn giữa (Ctrl+E)">Giữa</button>
          <button type="button" data-wcmd="justifyRight" title="Căn phải (Ctrl+R)">Phải ⯈</button>
          <button type="button" data-wcmd="justifyFull" title="Căn đều hai bên (Ctrl+J)">Đều</button>
          <select data-wline aria-label="Giãn dòng" title="Giãn dòng">${wOpts([["", "Giãn dòng"], ["1", "1,0"], ["1.15", "1,15"], ["1.3", "1,3"], ["1.5", "1,5"], ["2", "2,0"]], "")}</select>
          <select data-wspace aria-label="Khoảng cách sau đoạn" title="Khoảng cách sau đoạn">${wOpts([["", "Cách đoạn"], ["0", "0 pt"], ["6", "6 pt"], ["12", "12 pt"]], "")}</select>
        </div><span class="rb-lbl">Đoạn văn</span></div>
        <div class="rb-grp"><div class="rb-row">
          <select data-wblock aria-label="Kiểu đoạn" style="width:128px">${wOpts([["P", "Bình thường"], ["H1", "Tiêu đề 1"], ["H2", "Tiêu đề 2"], ["H3", "Tiêu đề 3"], ["BLOCKQUOTE", "Trích dẫn"]], "P")}</select>
        </div><span class="rb-lbl">Kiểu</span></div>
        <div class="rb-grp"><div class="rb-row">
          <button type="button" class="dict-btn" data-dictate title="Bấm để ghi âm, nói đến đâu chữ hiện vào văn bản đến đó (tại vị trí con trỏ). Bấm lần nữa để dừng.">🎤 Ghi âm</button>
          <button type="button" class="sum-btn" data-notesum title="Bôi đen đoạn cần tóm tắt rồi bấm nút này">✨ Tóm tắt</button>
        </div><span class="rb-lbl">Giọng nói &amp; AI</span></div>
      </div>
      <div class="rb-panel infile-toolbar" data-rpanel="insert" hidden>
        <div class="rb-grp"><div class="rb-row">
          <button type="button" data-wins="table">⊞ Bảng</button>
          <button type="button" data-wins="pagebreak" title="Phần sau bắt đầu ở trang mới (Ctrl+Enter)">⤓ Ngắt trang</button>
          <button type="button" data-wins="hr">― Đường kẻ</button>
          <button type="button" data-wins="link">🔗 Liên kết</button>
          <button type="button" data-wins="date">📅 Ngày</button>
          <button type="button" data-wins="check">☐ Mục chọn</button>
        </div><span class="rb-lbl">Chèn</span></div>
      </div>
      <div class="rb-panel infile-toolbar" data-rpanel="layout" hidden>
        <div class="rb-grp"><div class="rb-row">
          <select data-wpsize aria-label="Khổ giấy">${wOpts(Object.entries(PAGE_SIZES).map(([k, v]) => [k, v[2]]), p.size)}</select>
          <select data-wporient aria-label="Hướng giấy">${wOpts([["portrait", "Giấy dọc"], ["landscape", "Giấy ngang"]], p.orient)}</select>
          <select data-wpmargin aria-label="Lề trang" style="width:300px">${wOpts(Object.entries(MARGINS).map(([k, v]) => [k, "Lề: " + v.name]), p.margin)}</select>
        </div><span class="rb-lbl">Thiết lập trang (áp dụng cả khi xuất Word / in)</span></div>
      </div>
    </div>
    <div class="infile-transfer" id="wTransfer" hidden>
      <div class="infile-transfer-grid">
        <div class="infile-transfer-card">
          <h5>📌 1. Lưu &amp; Chuyển vào một File (Tài liệu) cụ thể</h5>
          <div class="infile-transfer-row"><select id="inFileTargetDoc">${allDocOptions(f.id)}</select></div>
          <div class="infile-transfer-row">
            <select id="inFileTransferDocMode" style="flex:1">
              <option value="attach">Đính kèm &amp; gắn vào file đích (kèm chuyển cùng thư mục)</option>
              <option value="merge">Gộp vào file đích (thêm thành mục mới trong file đích)</option>
            </select>
            <button type="button" class="btn primary sm" data-transferdoc="${esc(f.id)}">⇄ Chuyển vào File này</button>
          </div>
        </div>
        <div class="infile-transfer-card">
          <h5>📁 2. Lưu &amp; Chuyển sang Thư mục / Danh mục cụ thể</h5>
          <div class="infile-transfer-row"><select id="inFileTargetFolder">${allFolderOptions()}</select></div>
          <div class="infile-transfer-row">
            <button type="button" class="btn primary sm" data-transferfolder="${esc(f.id)}">⇄ Chuyển sang thư mục</button>
            <button type="button" class="btn sm" data-copyfolder="${esc(f.id)}">📋 Sao chép thêm vào thư mục</button>
          </div>
        </div>
      </div>
    </div>
    <div class="w-body">
      <aside class="w-tabs" aria-label="Các mục trong file">
        <div class="w-tabs-head"><b>MỤC TRONG FILE</b><button type="button" data-wtabadd title="Thêm mục mới">＋ Thêm</button></div>
        <div id="wTabList"></div>
        <p class="w-tabs-hint">Mỗi mục là một bài / một phần riêng, như tab của Google Docs. Bấm đúp tên mục để đổi tên. Khi xuất Word cả file, mỗi mục sang trang mới.</p>
      </aside>
      <div class="infile-canvas" id="wCanvas">
        <div class="w-pagewrap" id="wPageWrap">
          <div id="inFileSheet" class="infile-sheet w-page" contenteditable="true" spellcheck="true">${ed.tabs[0].html}</div>
        </div>
      </div>
    </div>
    <div class="w-status">
      <span id="wStPage">Trang 1</span><span id="wStWords"></span><span id="wStTab"></span><span class="grow"></span>
      <button type="button" data-wzoom="-" title="Thu nhỏ">−</button><span id="wZoomLbl">100%</span><button type="button" data-wzoom="+" title="Phóng to">+</button>
      <button type="button" data-wzoom="fit" title="Vừa chiều ngang khung">Vừa khung</button><button type="button" data-wzoom="1">100%</button>
    </div>
  </div>`;
}

function wRenderTabs() {
  if (!ed) return;
  const box = $("#wTabList"); if (!box) return;
  const n = ed.tabs.length;
  box.innerHTML = ed.tabs.map((t, i) => `<div class="w-tab${i === ed.active ? " on" : ""}" data-wtabgo="${i}" title="${esc(t.title)}">
    <span class="w-tab-nm" data-wtabname="${i}">${esc(t.title)}</span>
    <span class="w-tab-tools">
      <button type="button" data-wtabren="${i}" title="Đổi tên mục">✎</button>
      ${i > 0 ? `<button type="button" data-wtabup="${i}" title="Đưa lên">↑</button>` : ""}
      ${i < n - 1 ? `<button type="button" data-wtabdown="${i}" title="Đưa xuống">↓</button>` : ""}
      ${n > 1 ? `<button type="button" data-wtabdel="${i}" title="Xóa mục">🗑</button>` : ""}
    </span></div>`).join("");
  const st = $("#wStTab"); if (st) st.textContent = n > 1 ? "Mục " + (ed.active + 1) + "/" + n + ": " + ed.tabs[ed.active].title : "";
}
function wCommit() { const s = wSheet(); if (ed && s) ed.tabs[ed.active].html = cleanDictHTML(s); }
function wChanged() { const s = wSheet(); if (s) s.dispatchEvent(new Event("input")); }
function wGoTab(i) {
  if (!ed || i === ed.active || !ed.tabs[i]) return;
  if (dict) stopDictation();
  wCommit();
  ed.active = i; ed.range = null;
  const s = wSheet(); s.innerHTML = ed.tabs[i].html || "<p><br></p>";
  wRenderTabs(); wLayout();
  $("#wCanvas").scrollTop = 0;
  s.focus();
}
async function wAddTab() {
  if (!ed) return;
  const name = await ask("Tên mục mới (VD: Bài 2, Chương II, Phụ lục…):", { title: "THÊM MỤC MỚI TRONG FILE", input: "Tên mục", value: "Mục " + (ed.tabs.length + 1), ok: "Thêm mục" });
  if (name == null) return;
  wCommit();
  const title = name || ("Mục " + (ed.tabs.length + 1));
  ed.tabs.splice(ed.active + 1, 0, { id: "t-" + rid(), title, html: `<h2 style="margin-top:0">${esc(title)}</h2><p><br></p>` });
  const to = ed.active + 1;
  ed.active = to; const s = wSheet(); s.innerHTML = ed.tabs[to].html;
  wRenderTabs(); wLayout(); wChanged(); s.focus();
}
async function wRenameTab(i) {
  if (!ed || !ed.tabs[i]) return;
  const name = await ask("Đổi tên mục:", { title: "ĐỔI TÊN MỤC", input: "Tên mục", value: ed.tabs[i].title, ok: "Đổi tên" });
  if (!name) return;
  ed.tabs[i].title = name; wRenderTabs(); wChanged();
}
async function wDelTab(i) {
  if (!ed || ed.tabs.length < 2 || !ed.tabs[i]) return;
  if (!await ask("Xóa mục “" + ed.tabs[i].title + "” cùng toàn bộ nội dung của mục này?", { title: "XÓA MỤC", ok: "Xóa mục" })) return;
  if (dict) stopDictation();
  wCommit();
  ed.tabs.splice(i, 1);
  ed.active = Math.min(i === ed.active ? i : (i < ed.active ? ed.active - 1 : ed.active), ed.tabs.length - 1);
  wSheet().innerHTML = ed.tabs[ed.active].html || "<p><br></p>";
  wRenderTabs(); wLayout(); wChanged();
}
function wMoveTab(i, d) {
  const j = i + d; if (!ed || !ed.tabs[i] || !ed.tabs[j]) return;
  wCommit();
  [ed.tabs[i], ed.tabs[j]] = [ed.tabs[j], ed.tabs[i]];
  if (ed.active === i) ed.active = j; else if (ed.active === j) ed.active = i;
  wRenderTabs(); wChanged();
}

// Trang giấy: kích thước, lề, ngắt trang, phóng to/thu nhỏ, đếm trang/từ
function wApplyPage() {
  const s = wSheet(); if (!ed || !s) return;
  const { w, h, m } = pageDims(ed.page);
  s.style.width = w + "mm"; s.style.minHeight = h + "mm";
  s.style.padding = `${m.t}mm ${m.r}mm ${m.b}mm ${m.l}mm`;
  s.style.setProperty("--ph", h + "mm");
  wLayout();
}
function wLayout() {
  const s = wSheet(), wrap = $("#wPageWrap"); if (!ed || !s || !wrap) return;
  const { w, h, m } = pageDims(ed.page), ph = h * MM;
  // Ngắt trang: khoảng trống kéo dài tới đầu trang sau (như Word)
  s.querySelectorAll(".pg-break").forEach(b => {
    b.setAttribute("contenteditable", "false");
    b.style.height = "0px";
    const top = b.offsetTop;
    const next = Math.ceil((top + 1) / ph) * ph + m.t * MM;
    b.style.height = Math.max(24, next - top) + "px";
  });
  const z = ed.zoom;
  s.style.transform = z === 1 ? "" : `scale(${z})`;
  wrap.style.width = (w * MM * z) + "px";
  wrap.style.height = (s.offsetHeight * z) + "px";
  const pages = Math.max(1, Math.ceil((s.offsetHeight - 2) / ph));
  const zl = $("#wZoomLbl"); if (zl) zl.textContent = Math.round(z * 100) + "%";
  const pg = $("#wStPage"); if (pg) pg.textContent = "Khoảng " + pages + " trang";
  const words = t => (stripHtmlText(t).match(/\S+/g) || []).length;
  const cur = words(s.innerHTML);
  const total = ed.tabs.reduce((a, t, i) => a + (i === ed.active ? cur : words(t.html)), 0);
  const ws = $("#wStWords"); if (ws) ws.textContent = cur.toLocaleString("vi-VN") + " từ" + (ed.tabs.length > 1 ? " (cả file " + total.toLocaleString("vi-VN") + " từ)" : "");
}
function wZoom(v) {
  if (!ed) return;
  const cv = $("#wCanvas"), { w } = pageDims(ed.page);
  if (v === "fit") ed.zoom = cv ? Math.max(0.4, Math.min(1.5, (cv.clientWidth - 36) / (w * MM))) : 1;
  else if (v === "+") ed.zoom = Math.min(2, Math.round((ed.zoom + 0.1) * 10) / 10);
  else if (v === "-") ed.zoom = Math.max(0.4, Math.round((ed.zoom - 0.1) * 10) / 10);
  else ed.zoom = +v || 1;
  wLayout();
}
function initWordEditor() {
  const s = wSheet(); if (!ed || !s) return;
  wRenderTabs(); wApplyPage();
  const cv = $("#wCanvas"), { w } = pageDims(ed.page);
  if (cv && cv.clientWidth - 36 < w * MM) wZoom("fit");
  if (ed.ro) ed.ro.disconnect();
  let raf = 0;
  ed.ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(wLayout); });
  ed.ro.observe(s);
  s.addEventListener("input", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(wLayout); });
  s.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); wInsert("pagebreak"); }
  });
}

// Lệnh định dạng
function wRestore() {
  const s = wSheet(); if (!s) return null;
  const sel = window.getSelection();
  // Con trỏ đang ở trong trang thì dùng luôn; chỉ khôi phục vùng chọn đã nhớ khi tiêu điểm đã rời khỏi trang (ô chọn phông, hộp nhập…)
  const inside = sel && sel.rangeCount && s.contains(sel.getRangeAt(0).startContainer);
  s.focus();
  if (!inside && ed && ed.range && s.contains(ed.range.startContainer)) { sel.removeAllRanges(); sel.addRange(ed.range); }
  return sel;
}
function wWrapCollapsed(style) {
  // Con trỏ chưa bôi đen: tạo vùng chữ mới với định dạng đã chọn để gõ tiếp
  const sel = window.getSelection(); if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const sp = document.createElement("span"); Object.assign(sp.style, style); sp.textContent = "​";
  r.insertNode(sp);
  const nr = document.createRange(); nr.setStart(sp.firstChild, 1); nr.collapse(true);
  sel.removeAllRanges(); sel.addRange(nr);
}
function wFontSize(pt) {
  const s = wSheet(), sel = wRestore(); if (!s || !sel || !sel.rangeCount) return;
  if (sel.isCollapsed) { wWrapCollapsed({ fontSize: pt + "pt" }); wChanged(); return; }
  document.execCommand("styleWithCSS", false, false);
  document.execCommand("fontSize", false, "7");
  const made = [];
  s.querySelectorAll('font[size="7"]').forEach(fn => {
    const sp = document.createElement("span"); sp.style.fontSize = pt + "pt"; made.push(sp);
    if (fn.face) sp.style.fontFamily = fn.face; if (fn.color) sp.style.color = fn.color;
    while (fn.firstChild) sp.appendChild(fn.firstChild);
    sp.querySelectorAll("[style]").forEach(x => { x.style.fontSize = ""; });
    fn.replaceWith(sp);
  });
  s.querySelectorAll('span[style*="xxx-large"]').forEach(x => { x.style.fontSize = pt + "pt"; });
  if (made.length) { // giữ nguyên vùng bôi đen như Word để định dạng tiếp
    const r = document.createRange(); r.setStartBefore(made[0]); r.setEndAfter(made[made.length - 1]);
    sel.removeAllRanges(); sel.addRange(r); ed.range = r.cloneRange();
  }
  wChanged();
}
function wFontName(name) {
  const sel = wRestore(); if (!sel || !sel.rangeCount) return;
  if (sel.isCollapsed) { wWrapCollapsed({ fontFamily: `"${name}"` }); wChanged(); return; }
  document.execCommand("styleWithCSS", false, true);
  document.execCommand("fontName", false, name);
  wChanged();
}
function wColor(kind, val) {
  const sel = wRestore(); if (!sel) return;
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(kind === "hilite" ? "hiliteColor" : "foreColor", false, val);
  wChanged();
}
function wBlocks() {
  const s = wSheet(), sel = window.getSelection(); if (!s || !sel.rangeCount) return [];
  const B = "p,h1,h2,h3,h4,h5,h6,li,blockquote,div:not(.pg-break):not(.note-summary)";
  const r = sel.getRangeAt(0);
  let list = [...s.querySelectorAll(B)].filter(b => r.intersectsNode(b) && !b.querySelector(B));
  if (!list.length) {
    let n = r.startContainer; if (n.nodeType === 3) n = n.parentNode;
    const b = n.closest && n.closest(B);
    if (b && b !== s && s.contains(b)) list = [b];
    else { document.execCommand("formatBlock", false, "P"); n = sel.getRangeAt(0).startContainer; if (n.nodeType === 3) n = n.parentNode; const b2 = n.closest && n.closest("p"); if (b2 && s.contains(b2)) list = [b2]; }
  }
  return list;
}
function wParaStyle(prop, val) {
  const sel = wRestore(); if (!sel) return;
  const bl = wBlocks(); if (!bl.length) return;
  if (prop === "textIndent") { const on = !bl[0].style.textIndent; bl.forEach(b => { b.style.textIndent = on ? "1cm" : ""; }); }
  else bl.forEach(b => { b.style[prop] = val; });
  wChanged();
}
async function wInsert(k) {
  const s = wSheet(); if (!s) return;
  if (k === "table") {
    const v = await ask("Số hàng × số cột (VD: 3x4):", { title: "CHÈN BẢNG", input: "Hàng x Cột", value: "3x3", ok: "Chèn bảng" });
    if (!v) return;
    const m = v.match(/(\d+)\D+(\d+)/) || [0, 3, 3];
    const rows = Math.min(50, Math.max(1, +m[1])), cols = Math.min(12, Math.max(1, +m[2]));
    const cell = tag => "<" + tag + ">&nbsp;</" + tag + ">";
    const html = `<table><tbody><tr>${cell("th").repeat(cols)}</tr>${("<tr>" + cell("td").repeat(cols) + "</tr>").repeat(Math.max(0, rows - 1))}</tbody></table><p><br></p>`;
    wRestore(); document.execCommand("insertHTML", false, html);
  } else if (k === "link") {
    const url = await ask("Địa chỉ liên kết (https://…):", { title: "CHÈN LIÊN KẾT", input: "Địa chỉ", value: "https://", ok: "Chèn" });
    if (!url || url === "https://") return;
    const sel = wRestore();
    if (sel && sel.isCollapsed) document.execCommand("insertHTML", false, `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>&nbsp;`);
    else document.execCommand("createLink", false, url);
  } else {
    wRestore();
    if (k === "pagebreak") document.execCommand("insertHTML", false, `<div class="pg-break" contenteditable="false"></div><p><br></p>`);
    else if (k === "hr") document.execCommand("insertHorizontalRule", false, null);
    else if (k === "date") document.execCommand("insertHTML", false, `<span><i>(Ngày ${fmtDate(todayISO())})</i> </span>`);
    else if (k === "check") document.execCommand("insertHTML", false, `<p>☐ Nội dung cần kiểm tra / thực hiện…</p>`);
  }
  wChanged();
}
// Cập nhật ô phông/cỡ chữ theo vị trí con trỏ, nhớ vùng chọn để dùng lại khi bấm ribbon
document.addEventListener("selectionchange", () => {
  const s = wSheet(); if (!ed || !s) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !s.contains(sel.getRangeAt(0).startContainer)) return;
  ed.range = sel.getRangeAt(0).cloneRange();
  let n = sel.anchorNode; if (n && n.nodeType === 3) n = n.parentNode;
  if (!n || !n.nodeType) return;
  const cs = getComputedStyle(n);
  const fam = (cs.fontFamily.split(",")[0] || "").replace(/["']/g, "").trim();
  const fs = $("[data-wfont]"); if (fs && W_FONTS.includes(fam)) fs.value = fam;
  const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
  const zs = $("[data-wsize]"); if (zs) { if (![...zs.options].some(o => +o.value === pt)) { zs.querySelectorAll("option.tmp").forEach(o => o.remove()); const o = new Option(String(pt), String(pt)); o.className = "tmp"; zs.add(o); } zs.value = String(pt); }
  const bk = n.closest && n.closest("h1,h2,h3,blockquote,p");
  const bs = $("[data-wblock]"); if (bs) bs.value = bk && s.contains(bk) ? bk.tagName : "P";
});
// Nút ribbon không lấy mất vùng chọn trong trang
document.addEventListener("mousedown", e => {
  if (e.target.closest && e.target.closest(".ribbon button, .w-status button")) e.preventDefault();
});
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-wcmd],[data-wins],[data-wrtab],[data-wpane],[data-wtabgo],[data-wtabadd],[data-wtabren],[data-wtabup],[data-wtabdown],[data-wtabdel],[data-wzoom],[data-wtransfer],[data-winfo],[data-wexporttab],[data-wfirst]");
  if (!t || !ed) return;
  e.preventDefault();
  const d = t.dataset;
  if (d.wcmd) { const sel = wRestore(); if (sel) { document.execCommand("styleWithCSS", false, false); document.execCommand(d.wcmd, false, null); wChanged(); } }
  else if (d.wins) wInsert(d.wins);
  else if (t.hasAttribute("data-wfirst")) wParaStyle("textIndent");
  else if (d.wrtab) {
    document.querySelectorAll("[data-wrtab]").forEach(b => b.classList.toggle("on", b === t));
    document.querySelectorAll("[data-rpanel]").forEach(p => { p.hidden = p.dataset.rpanel !== d.wrtab; });
  }
  else if (t.hasAttribute("data-wpane")) { const w = $("#inFileWrap"); if (w) { w.classList.toggle("no-tabs"); requestAnimationFrame(wLayout); } }
  else if (d.wtabren) wRenameTab(+d.wtabren);
  else if (d.wtabup) wMoveTab(+d.wtabup, -1);
  else if (d.wtabdown) wMoveTab(+d.wtabdown, 1);
  else if (d.wtabdel) wDelTab(+d.wtabdel);
  else if (t.hasAttribute("data-wtabadd")) wAddTab();
  else if (d.wtabgo != null) wGoTab(+d.wtabgo);
  else if (d.wzoom) wZoom(d.wzoom);
  else if (t.hasAttribute("data-wtransfer")) { const p = $("#wTransfer"); if (p) p.hidden = !p.hidden; }
  else if (t.hasAttribute("data-winfo")) $("#dlgDoc").classList.toggle("show-info");
  else if (d.wexporttab) exportNoteFile(d.wexporttab, "doc", "tab");
});
document.addEventListener("dblclick", e => {
  const t = e.target.closest && e.target.closest("[data-wtabname]");
  if (t && ed) { e.preventDefault(); wRenameTab(+t.dataset.wtabname); }
});
document.addEventListener("change", e => {
  const t = e.target; if (!ed || !t.closest || !t.closest("#inFileWrap")) return;
  const d = t.dataset;
  if ("wfont" in d) wFontName(t.value);
  else if ("wsize" in d) wFontSize(+t.value);
  else if ("wcolor" in d) wColor("fore", t.value);
  else if ("whilite" in d) wColor("hilite", t.value);
  else if ("wblock" in d) { wRestore(); document.execCommand("formatBlock", false, t.value); wChanged(); }
  else if ("wline" in d) { if (t.value) wParaStyle("lineHeight", t.value); t.value = ""; }
  else if ("wspace" in d) { if (t.value !== "") wParaStyle("marginBottom", t.value + "pt"); t.value = ""; }
  else if ("wpsize" in d || "wporient" in d || "wpmargin" in d) {
    ed.page = { size: $("[data-wpsize]").value, orient: $("[data-wporient]").value, margin: $("[data-wpmargin]").value };
    wApplyPage(); wChanged();
  }
});

async function saveInFileNote(id, silent) {
  const f = items[id]; if (!f) return false;
  const sheet = $("#inFileSheet"), titleInp = $("#inFileTitleInput"), st = $("#inFileSaveStatus");
  if (!sheet) return false;
  let html = cleanDictHTML(sheet);
  if (ed && ed.id === id) {
    ed.tabs[ed.active].html = html;
    f.noteTabs = ed.tabs.map(t => ({ id: t.id, title: t.title, html: t.html }));
    f.notePage = { ...ed.page };
    html = joinTabs(f.noteTabs);
  }
  const newName = (titleInp && titleInp.value.trim()) || f.name;
  const plain = stripHtmlText(html).slice(0, 260);
  const now = new Date().toISOString();
  f.name = newName;
  f.noteContent = html;
  f.note = plain || f.note || "";
  f.modified = now;
  f.size = new Blob([html]).size;
  if (!driveIdOf(f) && (!f.link || f.link.startsWith("#doc/"))) {
    f.isNote = true;
    f.mime = "link";
    f.fmime = "text/html";
  }
  $("#docTitle").textContent = (f.star ? "★ " : "") + f.name;
  putLocalNote(f);
  if (canUp()) {
    try {
      if (st) st.textContent = "Đang lưu lên đám mây…";
      const payload = {
        id: f.id,
        name: f.name,
        noteContent: f.noteContent,
        note: f.note,
        modified: f.modified,
        size: f.size,
        isNote: !!f.isNote,
        mime: f.mime || "link",
        fmime: f.fmime || "text/html",
        cat: f.cat,
        parent: f.parent,
        access: levelOf(f)
      };
      if (f.noteTabs) payload.noteTabs = f.noteTabs;
      if (f.notePage) payload.notePage = f.notePage;
      await setDoc(doc(db, "pnd_items", f.id), payload, { merge: true });
      scheduleCatalogSync();
    } catch (e) { console.warn("Lưu nội dung file:", e.message); }
  }
  if (st) st.textContent = "✓ Đã lưu lúc " + new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (!silent) { toast("Đã lưu nội dung văn bản “" + f.name + "”.", "ok"); route(); }
  return true;
}

async function transferNoteToSpecificDoc(sourceId) {
  await saveInFileNote(sourceId, true);
  const src = items[sourceId]; if (!src) return;
  const sel = $("#inFileTargetDoc"), modeSel = $("#inFileTransferDocMode");
  const targetId = sel ? sel.value : "";
  const mode = modeSel ? modeSel.value : "attach";
  if (!targetId || !items[targetId]) { toast("Hãy chọn một File (Tài liệu) cụ thể cần chuyển vào.", "err"); return; }
  const target = items[targetId];
  const now = new Date().toISOString();
  const attached = Array.isArray(target.attachedNotes) ? target.attachedNotes.slice() : [];
  const entry = { id: src.id, name: src.name, date: todayISO(), summary: stripHtmlText(src.noteContent || src.note).slice(0, 180) };
  const idx = attached.findIndex(x => x.id === src.id);
  if (idx >= 0) attached[idx] = entry; else attached.unshift(entry);
  target.attachedNotes = attached;

  if (mode === "merge") {
    // Gộp = thêm (các) mục của văn bản nguồn thành mục mới trong file đích
    const base = Array.isArray(target.noteTabs) && target.noteTabs.length ? target.noteTabs.slice()
      : (target.noteContent || target.note) ? [{ id: "t-" + rid(), title: "Mục 1", html: target.noteContent || `<p>${esc(target.note)}</p>` }] : [];
    const sTabs = noteTabsOf(src);
    sTabs.forEach(t => base.push({ id: "t-" + rid(), title: sTabs.length === 1 ? src.name : src.name + " – " + t.title, html: t.html }));
    target.noteTabs = base;
    target.noteContent = joinTabs(base);
    target.note = ((target.note ? target.note + " | " : "") + "Gộp từ: " + src.name).slice(0, 300);
  } else {
    if (!target.noteContent) { target.noteContent = src.noteContent || ""; if (Array.isArray(src.noteTabs) && !target.noteTabs) { target.noteTabs = src.noteTabs.map(t => ({ ...t })); if (src.notePage) target.notePage = { ...src.notePage }; } }
    if (target.parent && tree[target.parent]) {
      src.parent = target.parent;
      src.cat = target.cat || tree[target.parent].cat;
      src.linkedDocId = target.id;
      src.linkedDocName = target.name;
    }
  }
  target.modified = now;
  putLocalNote(src);
  putLocalNote(target);
  if (canUp()) {
    try {
      const tp = { attachedNotes: target.attachedNotes, noteContent: target.noteContent || "", note: target.note || "", modified: now };
      if (target.noteTabs) tp.noteTabs = target.noteTabs;
      if (target.notePage) tp.notePage = target.notePage;
      await setDoc(doc(db, "pnd_items", target.id), tp, { merge: true });
      await setDoc(doc(db, "pnd_items", src.id), { parent: src.parent, cat: src.cat, linkedDocId: target.id, linkedDocName: target.name, modified: now }, { merge: true });
      scheduleCatalogSync();
    } catch (e) { console.warn("Chuyển vào file đích:", e.message); }
  }
  toast("Đã lưu và chuyển văn bản “" + src.name + "” vào file “" + target.name + "”!", "ok");
  route();
  openDoc(target.id);
}

async function transferNoteToSpecificFolder(sourceId, isCopy) {
  await saveInFileNote(sourceId, true);
  const src = items[sourceId]; if (!src) return;
  const sel = $("#inFileTargetFolder");
  const targetFolder = sel ? sel.value : "";
  if (!targetFolder || !tree[targetFolder]) { toast("Hãy chọn thư mục đích.", "err"); return; }
  const folderNode = tree[targetFolder];
  const now = new Date().toISOString();
  if (isCopy) {
    const newId = "note-" + rid();
    const copyItem = {
      ...src,
      id: newId,
      name: src.name + " (Bản sao)",
      parent: targetFolder,
      cat: folderNode.cat,
      access: canUp() ? folderLevel(targetFolder) : (src.access || "cong-khai"),
      added: now,
      modified: now
    };
    items[newId] = copyItem;
    putLocalNote(copyItem);
    if (canUp()) {
      try { await setDoc(doc(db, "pnd_items", newId), copyItem); scheduleCatalogSync(); } catch (e) {}
    }
    toast("Đã tạo bản sao vào thư mục “" + folderLabel(targetFolder) + "”.", "ok");
    route();
    return;
  }
  if (src.parent === targetFolder) { toast("File đã nằm trong thư mục này.", "ok"); return; }
  if (canUp() && driveIdOf(src) && src.mime !== "link" && !src.isNote) {
    await doMove(src.id, false, targetFolder);
    return;
  }
  src.parent = targetFolder;
  src.cat = folderNode.cat;
  delete src.order;
  src.modified = now;
  putLocalNote(src);
  if (canUp()) {
    try { await setDoc(doc(db, "pnd_items", src.id), { parent: targetFolder, cat: folderNode.cat, modified: now }, { merge: true }); scheduleCatalogSync(); } catch (e) {}
  }
  toast("Đã chuyển file “" + src.name + "” sang thư mục “" + folderLabel(targetFolder) + "”!", "ok");
  route();
  openDoc(src.id, currentDocMode);
}

function exportNoteFile(id, kind, scope) {
  const f = items[id]; if (!f) return;
  const live = ed && ed.id === id && wSheet();
  if (live) wCommit();
  const tabs = live ? ed.tabs : noteTabsOf(f);
  const page = live ? ed.page : notePageOf(f);
  const cur = live ? ed.active : 0;
  const list = scope === "tab" ? [tabs[cur]] : tabs;
  const many = list.length > 1;
  const baseName = (f.name || "van-ban-ghi-chu") + (scope === "tab" && tabs.length > 1 ? " - " + tabs[cur].title : "");
  const safeName = baseName.replace(/[\\/:*?"<>|]+/g, "_");
  const download = (blob, file) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const clean = html => { const d = document.createElement("div"); d.innerHTML = html || ""; d.querySelectorAll(".dict-interim").forEach(x => x.remove()); d.querySelectorAll("[contenteditable]").forEach(x => x.removeAttribute("contenteditable")); d.querySelectorAll(".pg-break").forEach(x => x.removeAttribute("style")); d.innerHTML = d.innerHTML.replace(/​/g, ""); return d.innerHTML; };
  if (kind === "txt") {
    const txt = list.map(t => (many ? t.title.toUpperCase() + "\n" + "-".repeat(30) + "\n" : "") + stripHtmlText(clean(t.html))).join("\n\n");
    download(new Blob(["﻿" + (f.name || "") + "\n" + "=".repeat(40) + "\n\n" + txt], { type: "text/plain;charset=utf-8" }), safeName + ".txt");
    toast("Đã tải về tệp " + safeName + ".txt", "ok");
    return;
  }
  const { w, h, m } = pageDims(page);
  if (kind === "doc") {
    const BR = `<br clear=all style='mso-special-character:line-break;page-break-before:always'>`;
    const body = list.map(t => (many ? `<h1>${esc(t.title)}</h1>` : "") + clean(t.html).replace(/<div class="pg-break"><\/div>/g, BR)).join(BR);
    const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${esc(baseName)}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]--><style>@page WordSection1{size:${w}mm ${h}mm;margin:${m.t}mm ${m.r}mm ${m.b}mm ${m.l}mm;mso-page-orientation:${page.orient}}div.WordSection1{page:WordSection1}${WORD_CSS}</style></head><body><div class="WordSection1">${body}</div></body></html>`;
    download(new Blob(["﻿" + docHtml], { type: "application/msword;charset=utf-8" }), safeName + ".doc");
    toast("Đã xuất file Word: " + safeName + ".doc", "ok");
    return;
  }
  if (kind === "print") {
    const body = list.map((t, i) => `<section${i ? ' style="page-break-before:always"' : ""}>${many ? `<h1>${esc(t.title)}</h1>` : ""}${clean(t.html)}</section>`).join("");
    const wnd = window.open("", "_blank", "width=900,height=720");
    if (!wnd) { toast("Hãy cho phép mở cửa sổ bật lên để in / lưu PDF.", "err"); return; }
    wnd.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(baseName)}</title><style>@page{size:${w}mm ${h}mm;margin:${m.t}mm ${m.r}mm ${m.b}mm ${m.l}mm}body{margin:0}${WORD_CSS}.pg-break{page-break-after:always;height:0;border:0}</style></head><body>${body}<script>window.onload=()=>{setTimeout(()=>{window.print();},250);}<\/script></body></html>`);
    wnd.document.close();
  }
}

async function deleteDocItem(id) {
  const f = items[id]; if (!f) return;
  if (!canUp() && !f.isLocalNote && !f.isNote) {
    openLogin("Xóa tài liệu cần tài khoản Thủ thư / Biên mục hoặc Quản trị.");
    return;
  }
  const did = driveIdOf(f);
  const msg = "Bạn có chắc chắn muốn xóa file “" + f.name + "” khỏi thư viện?" + (did && canUp() ? "\n(Tệp gốc trên Google Drive cũng sẽ được chuyển vào Thùng rác)." : "");
  if (!await ask(msg, { title: "XÓA FILE TÀI LIỆU", ok: "Xóa file" })) return;
  try {
    if (did && canUp() && f.mime !== "link" && !f.isNote) {
      try {
        await drive("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(did) + "?fields=id&supportsAllDrives=true", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true })
        });
      } catch (e) { console.warn("Chuyển tệp Drive vào thùng rác:", e.message); }
    }
    if (canUp()) {
      const ops = [{ type: "del", ref: doc(db, "pnd_items", id) }];
      if (catalog[id]) ops.push({ type: "del", ref: doc(db, "pnd_catalog", id) });
      await commitOps(ops);
      await logAct("FILE_DEL", f.name);
    }
    delete items[id];
    delete catalog[id];
    delLocalNote(id);
    if (f.star) {
      thongDung = thongDung.filter(s => s.id !== id);
      if (canUp()) try { await setDoc(doc(db, "pnd_settings", "thongdung"), { items: thongDung }); } catch (e) {}
    }
    try {
      const c = JSON.parse(localStorage.getItem("pnd_live2") || "null");
      if (c && c.items && c.items[id]) { delete c.items[id]; localStorage.setItem("pnd_live2", JSON.stringify(c)); }
    } catch (e) {}
    if ($("#dlgDoc").open && currentOpenDocId === id) $("#dlgDoc").close();
    toast("Đã xóa file “" + f.name + "”.", "ok");
    route();
  } catch (x) {
    toast("Chưa xóa được file: " + (x.message || x), "err");
  }
}

/* ---------- Chi tiết tài liệu (xem trước Google Drive & Soạn thảo trực tiếp trong file) ---------- */
function openDoc(id, forceMode) {
  const f = items[id]; if (!f) return;
  currentOpenDocId = id;
  const did = driveIdOf(f), k = fmtOf(f);
  const isNoteFile = !!(f.isNote || k === "note" || (!did && f.noteContent));
  const hasOriginalView = !!(did || (f.link && /^https?:\/\//.test(f.link)));
  currentDocMode = forceMode || (isNoteFile ? "edit" : "view");
  if (currentDocMode !== "edit" && ed && ed.ro) ed.ro.disconnect();
  if (currentDocMode !== "edit") ed = null;
  $("#dlgDoc").classList.toggle("word-on", !f.locked && (currentDocMode === "edit" || (!did && !(f.link && /^https?:\/\//.test(f.link)))));
  $("#dlgDoc").classList.remove("show-info");
  $("#docTitle").textContent = (f.star ? "★ " : "") + f.name;
  if (f.locked) {
    $("#docPreview").innerHTML = `<div class="pv-card"><div style="font-size:34px">🔒</div><h4>Bạn chưa được mở tài liệu này</h4><p class="muted">${esc(lockReason(f))}</p>${myGrant() ? "" : '<button type="button" class="btn primary" data-login>Đăng nhập</button>'}</div>`;
  } else if (currentDocMode === "edit") {
    $("#docPreview").innerHTML = inFileEditorHTML(f, hasOriginalView);
    requestAnimationFrame(initWordEditor);
    const tf = $("#inFileTargetFolder");
    if (tf && f.parent && tree[f.parent]) tf.value = f.parent;
    const sheet = $("#inFileSheet");
    if (sheet) {
      let autoSaveT = null;
      sheet.addEventListener("input", () => {
        const st = $("#inFileSaveStatus");
        if (st) st.textContent = "Đang soạn thảo (tự lưu nháp)…";
        clearTimeout(autoSaveT);
        autoSaveT = setTimeout(() => saveInFileNote(f.id, true), 1200);
      });
      sheet.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveInFileNote(f.id, false);
        }
      });
    }
  } else {
    const modeHeader = `<div class="infile-mode-bar" style="position:absolute;top:0;left:0;right:0;z-index:4;background:rgba(25,53,83,.92)"><div class="infile-mode-tabs"><button type="button" class="infile-tab on" data-docmode="view">👁 Xem tài liệu gốc</button><button type="button" class="infile-tab" data-docmode="edit">✎ Soạn thảo văn bản / Ghi chú trong file</button></div></div>`;
    $("#docPreview").innerHTML = did
      ? `${modeHeader}<iframe style="margin-top:42px;min-height:calc(62vh - 42px)" src="https://drive.google.com/file/d/${encodeURIComponent(did)}/preview" allow="autoplay" title="Xem trước tài liệu"></iframe>${canDl() ? "" : '<span class="pv-shield" style="top:42px" title="Tài khoản chỉ được xem, không tải về"></span>'}`
      : f.link && /^https?:\/\//.test(f.link)
        ? `${modeHeader}<div class="pv-card"><h4>Liên kết web</h4><p class="muted">Trang này mở trong thẻ mới của trình duyệt.</p><p style="overflow-wrap:anywhere;font-size:13px">${esc(f.link)}</p><a class="btn primary" style="display:inline-block;text-decoration:none" href="${esc(f.link)}" target="_blank" rel="noopener">Mở liên kết</a></div>`
        : inFileEditorHTML(f, false);
    if (ed && ed.id === f.id) requestAnimationFrame(initWordEditor);
  }
  const rows = [["Định dạng", FMT[k][0] + (f.size ? " · " + fmtSize(f.size) : "")], ["Số / ký hiệu", f.number], ["Ban hành bởi", f.issuer], ["Ngày ban hành", f.issued && fmtDate(f.issued)], ["Hiệu lực từ", f.effective && fmtDate(f.effective)], ["Tình trạng", f.status], ["Mức truy cập", LV[levelOf(f)].name], ["Thư mục", pathOf(f.parent).map(p => p.name).join(" › ")], ["Gắn với file", f.linkedDocName], ["Cập nhật", f.modified && fmtDate(String(f.modified).slice(0, 10))], ["Ghi chú", f.note]].filter(r => r[1]);
  const attachedHTML = Array.isArray(f.attachedNotes) && f.attachedNotes.length
    ? `<div class="attached-notes-box"><h5>📌 Văn bản ghi chú đã chuyển vào file này (${f.attachedNotes.length})</h5>${f.attachedNotes.map(n => `<div class="attached-note-item"><span><b>${esc(n.name)}</b> <small class="muted">(${fmtDate(n.date)})</small></span>${items[n.id] ? `<button type="button" class="btn sm" data-doc="${esc(n.id)}">Mở</button>` : ""}</div>`).join("")}</div>`
    : "";
  $("#docInfo").innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${a === "Tình trạng" ? `<span class="st-chip ${stCls(b)}">${esc(b)}</span>` : a === "Mức truy cập" ? lvChip(levelOf(f)) : esc(b)}</dd>`).join("") + `<dd style="grid-column:1/-1">${attachedHTML}</dd>`;
  const acts = [];
  if (f.locked) { $("#docActs").innerHTML = ""; if (!$("#dlgDoc").open) $("#dlgDoc").showModal(); return; }
  acts.push(`<button type="button" class="btn ${currentDocMode === "edit" ? "green" : "primary"}" data-docmode="${currentDocMode === "edit" ? (hasOriginalView ? "view" : "edit") : "edit"}">${currentDocMode === "edit" ? (hasOriginalView ? "👁 Chuyển sang Xem file gốc" : "✎ Đang ở chế độ Soạn thảo trong file") : "✎ Soạn thảo văn bản / Ghi chú trong file"}</button>`);
  if (f.link && /^https?:\/\//.test(f.link) && (!did || canDl())) acts.push(`<a class="btn" href="${esc(f.link)}" target="_blank" rel="noopener">${did ? "Mở trên Google Drive" : "Mở liên kết"}</a>`);
  if (did && !canDl()) acts.push(`<p class="muted" style="margin:0">Quyền của bạn: chỉ xem trực tuyến, không tải về.</p>`);
  if (did && canDl() && !/google-apps/.test(f.fmime || f.mime)) acts.push(`<a class="btn" href="https://drive.google.com/uc?export=download&id=${encodeURIComponent(did)}" target="_blank" rel="noopener">Tải về máy</a>`);
  if (canUp()) acts.push(`<button type="button" class="btn" data-edit="${esc(f.id)}">Sửa thông tin</button>`, `<button type="button" class="btn" data-move="${esc(f.id)}">Chuyển thư mục</button>`);
  if (canUp() || f.isLocalNote || f.isNote) acts.push(`<button type="button" class="btn danger" data-del="${esc(f.id)}">🗑 Xóa file</button>`);
  $("#docActs").innerHTML = acts.join("");
  if (!$("#dlgDoc").open) $("#dlgDoc").showModal();
}
$("#dlgDoc").addEventListener("close", async () => { stopDictation(); if (currentOpenDocId && $("#inFileSheet")) await saveInFileNote(currentOpenDocId, true); if (ed && ed.ro) ed.ro.disconnect(); ed = null; $("#dlgDoc").classList.remove("word-on", "show-info"); $("#docPreview").innerHTML = ""; currentOpenDocId = null; });

/* ---------- Tìm kiếm ---------- */
let searchCache = { q: null, hits: null };
const fold = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
async function renderSearch(q) {
  q = q.trim(); $("#searchInput").value = q;
  if (!q) { go(""); return; }
  const fq = fold(q).split(/\s+/).filter(Boolean);
  const hit = f => { const hay = fold([f.name, f.issuer, f.number, f.status, f.note, pathOf(f.parent).map(p => p.name).join(" ")].join(" ")); return fq.every(w => hay.includes(w)); };
  let res = Object.values(items).filter(f => canList(f) && hit(f)).map(f => ({ ...f, hit: false }));
  const draw = (extra) => {
    $("#main").innerHTML = `<section class="box"><h2 class="box-title">KẾT QUẢ TÌM KIẾM</h2><div class="crumbs">“${esc(q)}” · ${res.length} tài liệu${extra || ""}</div>${res.length ? tableHTML(sortFiles(res), true) : '<p class="empty">Không tìm thấy tài liệu phù hợp.</p>'}${navRow()}</section>`;
  };
  // Đổi bộ lọc trên cùng một từ khóa: dùng lại kết quả tìm trong nội dung, không gọi Drive lần nữa
  if (canUp() && searchCache.q === q && searchCache.hits) {
    const ids = new Set(res.map(r => r.id));
    searchCache.hits.forEach(id => { if (items[id] && !ids.has(id)) res.push({ ...items[id], hit: true }); });
    draw(" (gồm cả khớp trong nội dung tệp)"); return;
  }
  draw(canUp() ? (driveTok ? " · đang tìm cả trong nội dung tệp…" : " · đăng nhập lại Google (bấm Quét) để tìm cả trong nội dung tệp") : "");
  if (canUp() && driveTok) {
    try {
      const ids = new Set(res.map(r => r.id));
      const qq = "fullText contains '" + q.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "' and trashed=false";
      const j = await drive("https://www.googleapis.com/drive/v3/files?pageSize=200&fields=files(id)&q=" + encodeURIComponent(qq));
      const hits = [];
      (j.files || []).forEach(x => { const key = items[x.id] ? x.id : items["dr-" + x.id] ? "dr-" + x.id : null; if (key) { hits.push(key); if (!ids.has(key)) res.push({ ...items[key], hit: true }); } });
      searchCache = { q, hits };
      draw(" (gồm cả khớp trong nội dung tệp)");
    } catch (e) { draw(" · chưa tìm được trong nội dung: " + e.message); }
  }
}

/* ---------- Đăng nhập ---------- */
let loginTab = "code";
function openLogin(hint, tab) {
  $("#loginErr").textContent = ""; $("#loginHint").textContent = hint || "";
  setLoginTab(tab || "acct"); const d = $("#dlgLogin"); if (!d.open) d.showModal(); setTimeout(() => $(loginTab === "acct" ? "#admEmail" : "#codeInput").focus(), 50);
}
function setLoginTab(t) { loginTab = t;
document.querySelectorAll("#dlgLogin .tab").forEach(b => b.classList.toggle("on", b.dataset.tab === t)); document.querySelectorAll("#dlgLogin [data-pane]").forEach(p => p.hidden = p.dataset.pane !== t); $("#loginGo").textContent = t === "acct" ? "Đăng nhập" : "Xác nhận mã"; }

/* Đăng ký thao tác ảnh độc lập với tab đăng nhập, chỉ một lần. */
let imagePreviewObjectUrl = null;
function selectFolderCover(file) {
  if (!file || !file.type.startsWith("image/")) {
    $("#imagePasteStatus").textContent = "Hãy chọn ảnh PNG, JPG, WebP hoặc GIF.";
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    $("#imagePasteStatus").textContent = "Ảnh vượt quá 12 MB. Hãy chọn ảnh nhỏ hơn.";
    return;
  }
  if (imagePreviewObjectUrl) URL.revokeObjectURL(imagePreviewObjectUrl);
  imagePreviewObjectUrl = URL.createObjectURL(file);
  $("#imagePreview").innerHTML = `<img src="${esc(imagePreviewObjectUrl)}" alt="Ảnh đã chọn">`;
  $("#imagePasteStatus").textContent = "Đã nhận ảnh. Bấm “Lưu ảnh bìa” để tải lên Google Drive.";
  $("#imageSaveBtn").disabled = false;
  $("#imageSaveBtn").onclick = () => savePastedFolderImage(file);
}
$("#imagePasteArea").addEventListener("paste", e => {
  const image = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith("image/"));
  if (!image) {
    $("#imagePasteStatus").textContent = "Clipboard chưa có ảnh. Hãy thử “Chọn ảnh từ máy”.";
    return;
  }
  e.preventDefault();
  selectFolderCover(image.getAsFile());
});
$("#imageFileInput").addEventListener("change", e => {
  const file = e.target.files && e.target.files[0];
  if (file) selectFolderCover(file);
});
$("#imagePasteArea").addEventListener("click", () => $("#imagePasteArea").focus());
$("#imagePasteArea").addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); $("#imagePasteArea").classList.add("drag"); });
$("#imagePasteArea").addEventListener("dragleave", () => $("#imagePasteArea").classList.remove("drag"));
$("#imagePasteArea").addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); $("#imagePasteArea").classList.remove("drag"); const f = [...e.dataTransfer.files].find(x => x.type.startsWith("image/")); if (f) selectFolderCover(f); });
async function ensureUser() { if (auth.currentUser) return auth.currentUser; const r = await signInAnonymously(auth); return r.user; }
async function useCode(raw) {
  try { return await useCode0(raw); } catch (e) { if (/^Mã /.test(e.message)) e.invalidCode = true; throw e; }
}
async function useCode0(raw) {
  const code = norm(raw);
  if (!okCode(code)) throw new Error("Mã gồm 3–24 ký tự: chữ không dấu, chữ số, gạch ngang hoặc gạch dưới.");
  const u = await ensureUser();
  const m = await getDoc(doc(db, "pnd_ma", code));
  if (!m.exists()) throw new Error("Mã không đúng hoặc đã bị xóa.");
  const x = m.data();
  if (todayISO() > x.han) throw new Error("Mã đã hết hạn ngày " + fmtDate(x.han) + ".");
  const seat = doc(db, "pnd_ma", code, "luot", u.uid);
  if (!(await getDoc(seat)).exists()) {
    const used = (await getDocs(collection(db, "pnd_ma", code, "luot"))).size;
    if (x.max && used >= x.max) throw new Error("Mã đã đủ " + x.max + " người sử dụng.");
    await setDoc(seat, { t: Date.now() });
  }
  await setDoc(doc(db, "pnd_users", u.uid), { code, t: Date.now() });
  saveSession({ code, han: x.han, role: x.role || "chuyen-muc", cats: Array.isArray(x.cats) && x.cats.length ? x.cats : ["*"] });
}
async function adminLogin() {
  const prov = new GoogleAuthProvider();
  prov.addScope(DRIVE_SCOPE);
  prov.setCustomParameters({ prompt: "select_account", login_hint: ADMINS[0] || "" });
  if (auth.currentUser && isAdminUser(auth.currentUser)) prov.setCustomParameters({ login_hint: auth.currentUser.email });
  const r = await signInWithPopup(auth, prov);
  const cred = GoogleAuthProvider.credentialFromResult(r);
  if (!isAdminUser(r.user)) { await signOut(auth); throw new Error("Tài khoản " + r.user.email + " không có quyền quản trị."); }
  saveTok(cred && cred.accessToken || null);
}
function gisToken(prompt) {
  return new Promise((res, rej) => {
    if (!(window.google && google.accounts && google.accounts.oauth2) || !CFG.CLIENT_ID) return rej(new Error("gis"));
    // Quản trị: luôn dùng tài khoản Google sở hữu thư mục PND; thủ thư: email Google của chính họ
    const hint = isAdmin ? (CFG.DRIVE_OWNER || ADMINS[0] || "") : (user && user.email && !user.email.endsWith("@" + ACCT_DOMAIN) ? user.email : "") || (acct && acct.googleEmail) || "";
    const c = google.accounts.oauth2.initTokenClient({
      client_id: CFG.CLIENT_ID, scope: DRIVE_SCOPE, prompt, hint, login_hint: hint,
      callback: r => r && r.access_token ? res(r) : rej(new Error((r && r.error) || "token")),
      error_callback: e => rej(new Error((e && e.type) || "popup"))
    });
    c.requestAccessToken({ prompt, hint, login_hint: hint });
  });
}
let driveWho = null;   // tài khoản Google đang dùng cho Drive: { email, owner, canEdit }
/* Kiểm tra quyền Drive vừa cấp có sửa được thư mục gốc PND không (tránh dùng nhầm tài khoản Google) */
async function checkDriveTok(tk) {
  const H = { headers: { Authorization: "Bearer " + tk } };
  const a = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", H).then(r => r.json()).catch(() => ({}));
  driveWho = { email: a.user && a.user.emailAddress || "", owner: "", canEdit: true };
  if (!settings || !settings.rootId) return true;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${settings.rootId}?fields=capabilities(canEdit),owners(emailAddress)&supportsAllDrives=true`, H);
  const j = await r.json().catch(() => ({}));
  driveWho.owner = j.owners && j.owners[0] ? j.owners[0].emailAddress : "";
  driveWho.canEdit = !!(r.ok && j.capabilities && j.capabilities.canEdit);
  return driveWho.canEdit;
}
async function ensureDrive(force) {
  if (driveTok && !force) return driveTok;
  if (!canUp()) throw new Error("Tài khoản của bạn không có quyền thao tác trên Google Drive.");
  // Xin quyền Drive ngầm (không hỏi lại); nếu sai tài khoản thì mở cửa sổ chọn tài khoản Google có quyền sửa thư mục PND
  let wrong = null;
  for (const pr of ["", "select_account"]) {
    let r; try { r = await gisToken(pr); } catch (e) { console.warn("quyền Drive", pr || "ngầm", e.message); continue; }
    if (await checkDriveTok(r.access_token)) { saveTok(r.access_token, r.expires_in); renderAuth(); return driveTok; }
    wrong = { ...driveWho };
  }
  if (!wrong && isAdminUser(user)) { await adminLogin(); if (driveTok) return driveTok; }
  if (wrong) throw new Error("Tài khoản Google " + (wrong.email || "vừa chọn") + " không có quyền sửa thư mục PND trên Drive" + (wrong.owner ? " (thư mục thuộc " + wrong.owner + ")" : "") + ". Bấm lại và chọn đúng tài khoản " + (isAdmin ? (CFG.DRIVE_OWNER || wrong.owner) : "được cấp quyền") + ".");
  throw new Error("Chưa kết nối được Google Drive. Hãy cho phép cửa sổ bật lên và chọn tài khoản Google có quyền chỉnh sửa thư mục PND.");
}

/* ---------- Google Drive ---------- */
async function drive(url, opt = {}, retried) {
  const tk = await ensureDrive();
  const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + tk } });
  if (r.status === 401) { saveTok(null); if (!retried) return drive(url, opt, true); throw new Error("Chưa gia hạn được quyền Drive. Bấm lại để thử lần nữa."); }
  const j = await r.json().catch(() => ({}));
  // Quyền Drive đang lưu thuộc tài khoản Google không có quyền với tệp: bỏ đi, xin lại đúng tài khoản rồi thử một lần nữa
  const why = String((j.error && (j.error.errors || [])[0] && j.error.errors[0].reason) || "");
  if ((r.status === 403 || r.status === 404) && /insufficient|notFound|forbidden/i.test(why) && !retried && !(driveWho && driveWho.canEdit)) { saveTok(null); driveWho = null; return drive(url, opt, true); }
  if (!r.ok) throw new Error((j.error && j.error.message) || "Drive " + r.status);
  return j;
}
const FIELDS = "id,name,mimeType,webViewLink,modifiedTime,size,permissionIds,parents";
async function listChildren(id) {
  let out = [], page = "";
  do {
    const q = encodeURIComponent("'" + id + "' in parents and trashed=false");
    const j = await drive(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&fields=nextPageToken,files(${FIELDS})${page ? "&pageToken=" + page : ""}`);
    out = out.concat(j.files || []); page = j.nextPageToken || "";
  } while (page);
  return out;
}
async function createFolder(name, parent) {
  return drive("https://www.googleapis.com/drive/v3/files?fields=id,name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) });
}
async function uploadFile(file, parent, onProg) {
  const tk = await ensureDrive();
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=" + FIELDS, {
    method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": file.type || "application/octet-stream" },
    body: JSON.stringify({ name: file.name, parents: [parent] })
  });
  if (!start.ok) throw new Error("Không khởi tạo được tải lên (" + start.status + ").");
  const loc = start.headers.get("Location");
  const r = await fetch(loc, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || "Tải lên lỗi " + r.status);
  if (onProg) onProg();
  return j;
}
const isShared = f => (f.permissionIds || []).includes("anyoneWithLink");
const shareAnyone = id => drive(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) });
/* Ảnh bìa (thư mục, tài liệu) nằm trong thư mục riêng “_Ảnh bìa PND”, không lẫn vào Chờ phân loại */
const COVER_DIR = "_Ảnh bìa PND";
const isCoverName = n => /^(_|Anh-bia-|Bia-tai-lieu-)/.test(String(n || ""));
async function coverFolder() {
  if (settings.coverDir) return settings.coverDir;
  const q = encodeURIComponent("name='" + COVER_DIR + "' and mimeType='" + FOLDER + "' and '" + settings.rootId + "' in parents and trashed=false");
  const ex = await drive("https://www.googleapis.com/drive/v3/files?fields=files(id)&q=" + q);
  const id = ex.files && ex.files[0] ? ex.files[0].id : (await createFolder(COVER_DIR, settings.rootId)).id;
  settings.coverDir = id; await setDoc(doc(db, "pnd_settings", "root"), { coverDir: id }, { merge: true });
  return id;
}
async function uploadImage(file, prefix) {
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const up = await uploadFile(new File([file], prefix + "-" + rid().slice(0, 6) + "." + ext, { type: file.type }), await coverFolder());
  await shareAnyone(up.id);
  return { url: "https://drive.google.com/thumbnail?id=" + encodeURIComponent(up.id) + "&sz=w1200", id: up.id };
}
/* Gắn tệp (hoặc mọi tệp trong một thư mục) đã có trên Drive vào thư viện — tệp giữ nguyên vị trí */
async function attachDrive(did, key, parent, meta, share, nameIn) {
  const f = await drive(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(did)}?supportsAllDrives=true&fields=${FIELDS}`);
  const list = f.mimeType === FOLDER ? (await listChildren(f.id)).filter(x => x.mimeType !== FOLDER) : [f];
  if (!list.length) throw new Error("Thư mục “" + f.name + "” chưa có tệp nào.");
  const filled = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== "" && v !== false));
  const out = [];
  for (const x of list) {
    if (share && !isShared(x)) { try { await shareAnyone(x.id); x.permissionIds = (x.permissionIds || []).concat("anyoneWithLink"); } catch (e) { console.warn("chia sẻ", x.name, e.message); } }
    const name = nameIn && list.length === 1 ? nameIn : null;
    let it;
    if (items[x.id]) it = { ...items[x.id], ...filled, shared: isShared(x), ...(name ? { name } : {}) };       // tệp đã nằm trong kho PND
    else it = { ...fileItem(x, key, parent), ...(items["dr-" + x.id] || {}), id: "dr-" + x.id, driveId: x.id, fmime: x.mimeType || "", mime: "link", cat: key, parent, ...filled, name: name || (items["dr-" + x.id] || {}).name || x.name, added: (items["dr-" + x.id] || {}).added || new Date().toISOString() };
    await setDoc(doc(db, "pnd_items", it.id), it, { merge: true }); items[it.id] = it; out.push(it);
  }
  return out;
}
function fileItem(f, cat, parent) { return { id: f.id, name: f.name, mime: f.mimeType || "", link: f.webViewLink || ("https://drive.google.com/open?id=" + f.id), modified: f.modifiedTime || "", size: +f.size || 0, cat, parent, shared: isShared(f) }; }

async function commitOps(ops) { // ops: [{type:'set'|'merge'|'del', ref, data}]
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach(o => o.type === "del" ? b.delete(o.ref) : b.set(o.ref, o.data, o.type === "merge" ? { merge: true } : undefined));
    await b.commit();
  }
}
async function logAct(action, detail) { try { await addDoc(collection(db, "pnd_activity"), { at: new Date().toISOString(), action, detail: detail || "", by: user && user.email || "" }); } catch (e) {} }

/* Khởi tạo cây thư mục mẫu trên Drive */
async function initTree() {
  if (settings) { toast("Cây thư mục đã có sẵn."); return; }
  if (!await ask("Tạo thư mục “" + ROOT_NAME + "” cùng các danh mục và nhóm mẫu trong Google Drive của tài khoản quản trị?")) return;
  setBusy("#btnInit", true, "Đang tạo…");
  try {
    const q = encodeURIComponent("name='" + ROOT_NAME + "' and mimeType='" + FOLDER + "' and 'root' in parents and trashed=false");
    const ex = await drive("https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=" + q);
    const root = ex.files && ex.files[0] ? ex.files[0] : await createFolder(ROOT_NAME, "root");
    const existing = await listChildren(root.id);
    const byName = n => existing.find(f => f.mimeType === FOLDER && f.name === n);
    const cats = {};
    for (const c of BASE_CATS) {
      const f = byName(c.name) || await createFolder(c.name, root.id);
      cats[c.key] = f.id;
      const sub = await listChildren(f.id);
      for (const [g, cards] of Object.entries(c.sub || {})) {
        const gf = sub.find(x => x.mimeType === FOLDER && x.name === g) || await createFolder(g, f.id);
        const sub2 = await listChildren(gf.id);
        for (const k of cards) if (!sub2.find(x => x.mimeType === FOLDER && x.name === k)) await createFolder(k, gf.id);
      }
    }
    settings = { rootId: root.id, cats, created: new Date().toISOString() }; applyCatDefs();
    await setDoc(doc(db, "pnd_settings", "root"), settings);
    await logAct("INIT", root.id);
    toast("Đã tạo cây thư mục trên Drive. Đang quét…", "ok");
    await scanDrive(true);
  } catch (e) { toast("Chưa tạo được cây thư mục: " + e.message, "err"); }
  finally { setBusy("#btnInit", false, "Khởi tạo cây thư mục"); renderAuth(); }
}

/* Dựng cây thư mục + danh sách tệp từ Drive. listFn: đọc bằng quyền đăng nhập hoặc bằng khóa công khai.
   withCho: gồm cả Chờ phân loại và các nguồn bổ sung (chỉ quản trị). */
async function buildFromDrive(listFn, withCho, progress, allowCats) {
  const newTree = {}, newItems = {};
  const keyById = Object.fromEntries(Object.entries(settings.cats).map(([k, v]) => [v, k]));
  let level = [];
  const top = await listFn(settings.rootId);
  if (!top.length) { const e = new Error("Thư mục gốc chưa chia sẻ hoặc đang trống"); e.status = 403; throw e; }
  for (const f of top) {
    const key = keyById[f.id];
    if (!key && isCoverName(f.name)) continue; // ảnh bìa, không phải tài liệu
    if (f.mimeType === FOLDER) {
      if (key) { if (allowCats && !allowCats(key)) continue; newTree[f.id] = { id: f.id, name: CAT[key] ? CAT[key].name : f.name, parent: settings.rootId, cat: key, depth: 1 }; }
      else if (withCho) newTree[f.id] = { id: f.id, name: f.name, parent: settings.cats.cho, cat: "cho", depth: 2 };
      else continue;
      if (key !== "cho" || withCho) level.push(f.id);
    } else if (withCho) newItems[f.id] = fileItem(f, "cho", settings.cats.cho);
  }
  if (withCho) for (const src of (settings.sources || [])) if (!newTree[src.id]) { newTree[src.id] = { id: src.id, name: "Nguồn: " + src.name, parent: settings.cats.cho, cat: "cho", depth: 2, source: true }; level.push(src.id); }
  for (const [k, id] of Object.entries(settings.cats)) if (!newTree[id] && (withCho || k !== "cho") && (!allowCats || allowCats(k))) newTree[id] = { id, name: CAT[k] ? CAT[k].name : k, parent: settings.rootId, cat: k, depth: 1, missing: true };
  let n = 0;
  while (level.length && n < 8000) {
    if (progress) progress("Đang đọc Drive: " + Object.keys(newTree).length + " thư mục, " + n + " tệp");
    const next = [];
    for (let i = 0; i < level.length; i += 6) {
      const part = level.slice(i, i + 6);
      const lists = await Promise.all(part.map(id => listFn(id).catch(() => [])));
      part.forEach((id, j) => {
        const parent = newTree[id];
        for (const f of lists[j]) {
          if (f.mimeType === FOLDER) { if (!newTree[f.id]) { newTree[f.id] = { id: f.id, name: f.name, parent: id, cat: parent.cat, depth: parent.depth + 1 }; next.push(f.id); } }
          else { newItems[f.id] = fileItem(f, parent.cat, id); n++; }
        }
      });
    }
    level = next;
  }
  return { newTree, newItems, n };
}

/* Đọc trực tiếp thư mục Drive đã chia sẻ "Bất kỳ ai có đường liên kết" bằng khóa công khai — không cần đăng nhập Drive */
let liveState = "";   // "", "ok", "private"
async function publicList(id) {
  let out = [], page = "";
  do {
    const q = encodeURIComponent("'" + id + "' in parents and trashed=false");
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(${FIELDS})&key=${CFG.DRIVE_KEY}${page ? "&pageToken=" + page : ""}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || "Drive " + r.status); e.status = r.status; throw e; }
    out = out.concat(j.files || []); page = j.nextPageToken || "";
  } while (page);
  return out;
}
const META = ["issuer", "number", "issued", "effective", "status", "note", "star", "added", "access", "coverUrl", "coverFileId", "isNote", "noteContent", "noteTabs", "notePage", "attachedNotes", "linkedDocId", "linkedDocName", "fmime"];
const TREE_KEEP = ["order", "imageUrl", "imageFileId", "access", "desc"];
async function loadLive() {
  if (!settings || !CFG.DRIVE_KEY || !canUp()) return false;
  try {
    const allow = isAdmin ? null : (k => canCat(k));
    // Tìm tệp mới: đọc bằng quyền đăng nhập nếu quản trị đang có phiên Drive, nếu không đọc qua link chia sẻ
    let res;
    try {
      res = await buildFromDrive(publicList, isAdmin, null, allow);
    }
    catch (e) { if (isAdmin && driveTok) res = await buildFromDrive(listChildren, true, null, allow); else throw e; }
    const { newTree, newItems } = res;
    const gcRoot = catRootId("bst-ghi-chu");
    if (gcRoot && !newTree[gcRoot]) newTree[gcRoot] = tree[gcRoot] || { id: gcRoot, name: (CAT["bst-ghi-chu"] && CAT["bst-ghi-chu"].name) || "Ghi chú", parent: (settings && settings.rootId) || "root", cat: "bst-ghi-chu", depth: 1 };
    const meta = items; // dữ liệu ghi chú và thứ tự đã tải từ Firestore
    for (const [id, n] of Object.entries(newTree)) if (tree[id]) { for (const k of TREE_KEEP) if (tree[id][k] !== undefined) n[k] = tree[id][k]; }
    for (const [id, it] of Object.entries(newItems)) if (meta[id]) { for (const k of [...META, "order"]) if (meta[id][k] !== undefined) it[k] = meta[id][k]; if (meta[id].name) it.name = meta[id].name; }
    for (const [id, m] of Object.entries(meta)) if ((m.mime === "link" || m.isNote) && (newTree[m.parent] || m.cat === "bst-ghi-chu")) newItems[id] = m; // tài liệu dạng link & văn bản ghi chú
    if (isAdmin) for (const [id, n] of Object.entries(tree)) if (n.cat === "cho" && !newTree[id]) newTree[id] = n; // giữ Chờ phân loại khi đọc công khai
    if (isAdmin) for (const [id, m] of Object.entries(meta)) if (m.cat === "cho" && !newItems[id]) newItems[id] = m;
    tree = newTree; items = newItems; liveState = "ok";
    return true;
  } catch (e) { console.warn("Đọc Drive trực tiếp", e.message); liveState = e.status === 403 || e.status === 404 ? "private" : ""; return false; }
}

/* Quét toàn bộ cây thư mục, cập nhật chỉ mục (không sửa, không xóa tệp trên Drive) */
async function scanDrive(silent) {
  if (!settings) { toast("Chưa có cây thư mục. Bấm “Khởi tạo cây thư mục” trước.", "err"); return; }
  setBusy("#btnScan", true, "Đang quét…");
  try {
    const { newTree, newItems, n } = await buildFromDrive(listChildren, true, t => $("#adminNote").textContent = t);
    // Đồng bộ chỉ mục Firestore
    const oldTree = {}, oldItems = {};
    (await getDocs(collection(db, "pnd_tree"))).forEach(d => oldTree[d.id] = d.data());
    (await getDocs(collection(db, "pnd_items"))).forEach(d => oldItems[d.id] = d.data());
    const ops = [];
    for (const [id, v] of Object.entries(newTree)) { const saved = oldTree[id] || {}; for (const k of TREE_KEEP) if (saved[k] !== undefined) v[k] = saved[k]; if (JSON.stringify(saved) !== JSON.stringify(v)) ops.push({ type: "set", ref: doc(db, "pnd_tree", id), data: v }); }
    for (const id of Object.keys(oldTree)) if (!newTree[id]) ops.push({ type: "del", ref: doc(db, "pnd_tree", id) });
    for (const [id, v] of Object.entries(newItems)) { const o = oldItems[id] || {}; if (!o.access) v.access = folderLevel(v.parent, newTree); if (!o.access || ["name", "mime", "link", "modified", "size", "cat", "parent", "shared"].some(k => o[k] !== v[k])) ops.push({ type: "merge", ref: doc(db, "pnd_items", id), data: v }); }
    for (const [id, o] of Object.entries(oldItems)) if (!newItems[id] && o.mime !== "link" && !o.isNote) ops.push({ type: "del", ref: doc(db, "pnd_items", id) });
    await commitOps(ops);
    await logAct("SCAN", n + " tệp, " + Object.keys(newTree).length + " thư mục");
    settings.lastScan = Date.now(); await setDoc(doc(db, "pnd_settings", "root"), { lastScan: settings.lastScan }, { merge: true });
    await Promise.all([loadTree(), loadItems()]);
    const unshared = Object.values(items).filter(f => f.shared === false && f.mime !== "link" && f.cat !== "cho").length;
    $("#adminNote").textContent = "Đã quét " + n + " tệp, " + Object.keys(newTree).length + " thư mục." + (unshared ? " " + unshared + " tệp chưa mở chia sẻ xem." : "");
    if (!silent) toast("Đã quét xong: " + n + " tệp.", "ok");
    route();
  } catch (e) { toast("Quét chưa xong: " + e.message, "err"); $("#adminNote").textContent = ""; }
  finally { setBusy("#btnScan", false, "Quét Google Drive"); }
}

/* Mở chia sẻ "Bất kỳ ai có đường liên kết đều xem được" cho tệp đã xếp danh mục */
async function shareAll() {
  const list = Object.values(items).filter(f => f.shared === false && driveIdOf(f) && f.cat !== "cho" && levelOf(f) !== "mat");
  if (!list.length) { toast("Mọi tài liệu đã được mở chia sẻ xem."); return; }
  if (!await ask("Mở chia sẻ “Bất kỳ ai có đường liên kết đều xem được” cho " + list.length + " tệp trong kho PND (trừ tài liệu Mật)?\nChỉ người có quyền theo mức truy cập mới thấy đường link trên web; nội dung tệp không bị sửa.")) return;
  setBusy("#btnShare", true, "Đang chia sẻ…");
  let ok = 0;
  try {
    for (const f of list) {
      try { await shareAnyone(driveIdOf(f)); f.shared = true; ok++;
        await setDoc(doc(db, "pnd_items", f.id), { shared: true }, { merge: true }); } catch (e) { console.warn(f.name, e.message); }
      $("#adminNote").textContent = "Đã chia sẻ " + ok + "/" + list.length;
    }
    await logAct("SHARE", ok + " tệp");
    toast("Đã mở chia sẻ xem cho " + ok + " tệp.", ok === list.length ? "ok" : "err");
  } finally { setBusy("#btnShare", false, "Mở chia sẻ xem tài liệu"); route(); }
}
/* Thêm thư mục Drive có sẵn làm nguồn: tài liệu được đưa vào “Chờ phân loại” để xếp vào danh mục */
async function addSource() {
  if (!settings) { toast("Chưa có cây thư mục. Bấm “Khởi tạo cây thư mục” trước.", "err"); return; }
  const raw = await ask("Dán đường link hoặc mã thư mục Google Drive đang chứa tài liệu (ví dụ kho cũ). Tài liệu sẽ hiện trong mục CHỜ PHÂN LOẠI để sếp xếp vào danh mục; tệp gốc không bị sửa.", { title: "THÊM NGUỒN DRIVE", input: "Link hoặc mã thư mục", value: "https://drive.google.com/drive/folders/1Jt2Kp1o44elRiDdHfQ2lEx9vEbruET_Y", ok: "Thêm và quét" });
  if (!raw) return;
  const m = raw.match(/folders\/([\w-]{10,})/) || raw.match(/[?&]id=([\w-]{10,})/) || raw.match(/^([\w-]{10,})$/);
  if (!m) { toast("Không nhận ra mã thư mục trong đường link.", "err"); return; }
  try {
    const f = await drive("https://www.googleapis.com/drive/v3/files/" + m[1] + "?fields=id,name,mimeType");
    if (f.mimeType !== FOLDER) throw new Error("Đây không phải thư mục.");
    if (f.id === settings.rootId || Object.values(settings.cats).includes(f.id)) throw new Error("Thư mục này đã nằm trong kho PND.");
    const sources = (settings.sources || []).filter(x => x.id !== f.id).concat([{ id: f.id, name: f.name }]);
    settings.sources = sources;
    await setDoc(doc(db, "pnd_settings", "root"), { sources }, { merge: true });
    toast("Đã thêm nguồn “" + f.name + "”. Đang quét…", "ok");
    await scanDrive(true);
    go("dm/cho");
  } catch (x) { toast("Chưa thêm được nguồn: " + x.message, "err"); }
}

/* Tạo, đổi tên, xóa thư mục (trên Drive và chỉ mục) */
function subtreeIds(id) { const out = [id]; for (const c of childrenOf(id)) out.push(...subtreeIds(c.id)); return out; }
async function newFolder(parent) {
  const p = tree[parent]; if (!p) return;
  const name = await ask("Tạo thư mục mới bên trong “" + (p.depth <= 1 ? CAT[p.cat].name : p.name) + "”.", { title: "THƯ MỤC MỚI", input: "Tên thư mục", ok: "Tạo" });
  if (!name) return;
  try {
    const f = await createFolder(name, parent);
    const node = { id: f.id, name: f.name, parent, cat: p.cat, depth: p.depth + 1 };
    await setDoc(doc(db, "pnd_tree", f.id), node); tree[f.id] = node;
    await logAct("FOLDER_NEW", name); toast("Đã tạo thư mục “" + name + "”.", "ok"); route();
  } catch (x) { toast("Chưa tạo được thư mục: " + x.message, "err"); }
}
async function renameFolder(id) {
  const n = tree[id]; if (!n || n.depth < 2) return;
  const name = await ask("Đổi tên thư mục (tên trên Google Drive cũng được đổi theo).", { title: "ĐỔI TÊN THƯ MỤC", input: "Tên mới", value: n.name, ok: "Lưu" });
  if (!name || name === n.name) return;
  try {
    await drive("https://www.googleapis.com/drive/v3/files/" + id + "?fields=id,name", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    await setDoc(doc(db, "pnd_tree", id), { name }, { merge: true }); n.name = name;
    await logAct("FOLDER_RENAME", name); toast("Đã đổi tên thành “" + name + "”.", "ok"); route();
  } catch (x) { toast("Chưa đổi được tên: " + x.message, "err"); }
}
async function deleteFolder(id) {
  const n = tree[id]; if (!n || n.depth < 2) return;
  const ids = subtreeIds(id), files = Object.values(items).filter(f => ids.includes(f.parent));
  const msg = "Xóa thư mục “" + n.name + "”" + (ids.length > 1 ? " cùng " + (ids.length - 1) + " thư mục con" : "") + (files.length ? " và " + files.length + " tài liệu bên trong" : "") + "?\nThư mục được chuyển vào Thùng rác của Google Drive, khôi phục được trong 30 ngày.";
  if (!await ask(msg, { title: "XÓA THƯ MỤC", ok: "Xóa" })) return;
  try {
    await drive("https://www.googleapis.com/drive/v3/files/" + id + "?fields=id", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    const ops = ids.map(i => ({ type: "del", ref: doc(db, "pnd_tree", i) })).concat(files.map(f => ({ type: "del", ref: doc(db, "pnd_items", f.id) })));
    await commitOps(ops);
    ids.forEach(i => delete tree[i]); files.forEach(f => delete items[f.id]);
    if (files.some(f => f.star)) { thongDung = thongDung.filter(s => !files.find(f => f.id === s.id)); await setDoc(doc(db, "pnd_settings", "thongdung"), { items: thongDung }); }
    await logAct("FOLDER_TRASH", n.name);
    toast("Đã xóa thư mục “" + n.name + "” (nằm trong Thùng rác Drive 30 ngày).", "ok");
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === "f/" + id || ids.includes(h.slice(2))) go("f/" + encodeURIComponent(n.parent)); else route();
  } catch (x) { toast("Chưa xóa được: " + x.message, "err"); }
}

/* Chuyển tệp hoặc thư mục vào thư mục khác trên Drive (thao tác của quản trị viên, có xác nhận) */
function allFolderOptions(exclude) {
  const out = [];
  for (const c of visibleCats()) {
    const rootId = catRootId(c.key); if (!rootId) continue;
    const walk = (id, lvl) => { if (id === exclude) return; const n = tree[id]; if (!n) return; out.push(`<option value="${esc(id)}">${"— ".repeat(lvl)}${esc(lvl ? n.name : c.name.toUpperCase())}</option>`); sortFolders(childrenOf(id)).forEach(k => walk(k.id, lvl + 1)); };
    walk(rootId, 0);
  }
  return out.join("");
}
async function moveTo(id, isFolder) {
  const cur = isFolder ? tree[id] : items[id]; if (!cur) return;
  const target = await ask("Chuyển “" + cur.name + "” sang thư mục:", { title: isFolder ? "CHUYỂN THƯ MỤC" : "CHUYỂN TÀI LIỆU", options: allFolderOptions(isFolder ? id : null), ok: "Chuyển" });
  if (!target || target === cur.parent) return;
  if (await doMove(id, isFolder, target)) go("f/" + encodeURIComponent(target));
}
const folderLabel = id => tree[id] ? (tree[id].depth <= 1 ? CAT[tree[id].cat].name : tree[id].name) : id;
/* Chuyển tài liệu hoặc cả thư mục (kèm mọi thứ bên trong) sang thư mục khác — dùng cho nút Chuyển và kéo thả */
async function doMove(id, isFolder, target) {
  const cur = isFolder ? tree[id] : items[id]; if (!cur || !tree[target] || target === cur.parent) return false;
  if (isFolder && subtreeIds(id).includes(target)) { toast("Không chuyển được thư mục vào chính nó hoặc thư mục con của nó.", "err"); return false; }
  try {
    const driveFile = isFolder || cur.mime !== "link";
    if (driveFile) {
      const f = await drive("https://www.googleapis.com/drive/v3/files/" + id + "?fields=parents&supportsAllDrives=true");
      await drive("https://www.googleapis.com/drive/v3/files/" + id + "?addParents=" + target + "&removeParents=" + (f.parents || []).join(",") + "&fields=id&supportsAllDrives=true", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    }
    await logAct("MOVE", cur.name + " → " + folderLabel(target));
    if (isFolder) { toast("Đã chuyển thư mục “" + cur.name + "” vào “" + folderLabel(target) + "”. Đang cập nhật…", "ok"); await scanDrive(true); }
    else {
      await setDoc(doc(db, "pnd_items", id), { parent: target, cat: tree[target].cat }, { merge: true });
      cur.parent = target; cur.cat = tree[target].cat; delete cur.order;
      toast("Đã chuyển “" + cur.name + "” vào “" + folderLabel(target) + "”.", "ok"); route();
    }
    return true;
  } catch (x) { toast("Chưa chuyển được: " + x.message, "err"); return false; }
}
/* Kéo thả: thả vào giữa thẻ thư mục (hoặc tên thư mục ở cột trái, đường dẫn) = chuyển vào; thả vào mép thẻ cùng cấp = đổi thứ tự */
function dropTarget(e) {
  if (!canUp() || !dragItem || !e.target.closest) return null;
  let fid = null, el = null;
  const card = e.target.closest('[data-sort-kind="folder"]');
  if (card) {
    const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    const canReorder = dragItem.sortKind === "folder" && card.dataset.sortParent === dragItem.sortParent;
    if (!canReorder || (x > 0.22 && x < 0.78)) { fid = card.dataset.sortId; el = card; }
  } else {
    const t = e.target.closest(".catnav [data-folder], .catnav [data-cat], .crumbs a[data-folder], .ftbl a[data-folder]");
    if (t) { fid = t.dataset.folder || catRootId(t.dataset.cat); el = t; }
  }
  if (!fid || !tree[fid] || fid === dragItem.sortId) return null;
  const isF = dragItem.sortKind === "folder", cur = isF ? tree[dragItem.sortId] : items[dragItem.sortId];
  if (!cur || cur.parent === fid || (isF && subtreeIds(dragItem.sortId).includes(fid))) return null;
  return { fid, el };
}
const clearDropMarks = () => document.querySelectorAll(".drop-into,.sort-over,.sort-before,.sort-after").forEach(x => x.classList.remove("drop-into", "sort-over", "sort-before", "sort-after"));
/* Thả vào nửa sau của thẻ (bên phải ở dạng lưới, nửa dưới ở dạng danh sách) thì chèn sau thẻ đó */
function dropAfter(row, e) {
  const r = row.getBoundingClientRect();
  return row.classList.contains("doc-row") ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
}

function setBusy(sel, on, label) { const b = $(sel); if (b) { b.disabled = on; b.textContent = label; } }

/* ---------- Thông dụng ---------- */
async function syncStar(f) {
  const rest = thongDung.filter(s => s.id !== f.id);
  thongDung = f.star ? [{ id: f.id, name: f.name, cat: f.cat, parent: f.parent }].concat(rest) : rest;
  await setDoc(doc(db, "pnd_settings", "thongdung"), { items: thongDung.slice(0, 60) });
}

/* ---------- Tải lên / nhập tài liệu ---------- */
let upFilesSel = [], upLevel = DEFAULT_LEVEL, upLevelTouched = false, upAutoFrom = null;
/* Ô chọn ảnh bìa: bấm để chọn, kéo thả hoặc dán (Ctrl+V) */
function coverPicker(el) {
  const st = { file: null, clear: false };
  const inp = el.querySelector("input"), prev = el.querySelector(".cp-prev");
  let obj = null;
  const show = url => { prev.style.backgroundImage = url ? `url("${url}")` : ""; el.classList.toggle("has", !!url); };
  const set = file => {
    if (!file || !file.type.startsWith("image/")) { toast("Hãy chọn tệp ảnh (JPG, PNG, WebP).", "err"); return; }
    if (file.size > 12 * 1024 * 1024) { toast("Ảnh vượt quá 12 MB.", "err"); return; }
    if (obj) URL.revokeObjectURL(obj); obj = URL.createObjectURL(file);
    st.file = file; st.clear = false; show(obj);
  };
  el.addEventListener("click", () => inp.click());
  el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
  inp.addEventListener("click", e => e.stopPropagation());
  inp.onchange = () => { if (inp.files[0]) set(inp.files[0]); };
  el.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); el.classList.add("drag"); });
  el.addEventListener("dragleave", () => el.classList.remove("drag"));
  el.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); el.classList.remove("drag"); const f = [...e.dataTransfer.files].find(x => x.type.startsWith("image/")); if (f) set(f); });
  el.addEventListener("paste", e => { const it = [...(e.clipboardData && e.clipboardData.items || [])].find(x => x.type.startsWith("image/")); if (it) { e.preventDefault(); set(it.getAsFile()); } });
  st.reset = url => { st.file = null; st.clear = false; inp.value = ""; show(url || ""); };
  st.markClear = () => { st.file = null; st.clear = true; inp.value = ""; show(""); };
  return st;
}
const upCover = coverPicker($("#upCover")), edCover = coverPicker($("#edCover"));

/* --- Nhận diện tên văn bản: từ tên tệp và từ các tài liệu đã lưu --- */
const stripExt = n => String(n || "").replace(/\.[a-z0-9]{2,5}$/i, "");
function issuerOf(suf) {
  const s = String(suf || "").toUpperCase();
  if (/^QH\d*$/.test(s)) return "Quốc hội";
  if (/^UBTVQH\d*$/.test(s)) return "Ủy ban Thường vụ Quốc hội";
  if (/^L-CTN$/.test(s)) return "Chủ tịch nước";
  if (/(NĐ|ND|NQ)-CP$/.test(s)) return "Chính phủ";
  if (/QĐ-TTG$|QD-TTG$|CT-TTG$/.test(s)) return "Thủ tướng Chính phủ";
  if (/-HVHC$|-HVHCQT$|-HVHCQG$/.test(s)) return "Học viện Hành chính và Quản trị công";
  return "";
}
function guessMeta(text) {
  const m = String(text || "").match(/(\d{1,4})\s*[\/_]\s*((?:19|20)\d{2})\s*[\/_]\s*([A-ZĐa-zđ]{1,8}\d*(?:\s*-\s*[A-ZĐa-zđ0-9]{1,10}){0,3})/);
  if (!m) return {};
  const number = m[1] + "/" + m[2] + "/" + m[3].replace(/\s+/g, "").toUpperCase();
  return { number, issuer: issuerOf(number.split("/")[2]) };
}
const cleanName = n => stripExt(n).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
function findSaved(name, number) {
  const fn = fold(cleanName(name));
  const all = Object.values(items);
  return (fn && all.find(f => fold(cleanName(f.name)) === fn)) || (number && all.find(f => f.number && f.number.toUpperCase() === number.toUpperCase())) || null;
}
function applyAuto(name) {
  const g = guessMeta(name), saved = findSaved(name, g.number), notes = [];
  const fill = (id, v) => { const el = $(id); if (v && !el.value) { el.value = v; return true; } return false; };
  if (saved) {
    ["Issuer:issuer", "Number:number", "Issued:issued", "Effective:effective", "Status:status", "Note:note"].forEach(p => { const [a, b] = p.split(":"); fill("#up" + a, saved[b]); });
    if (!upLevelTouched && saved.access) setUpLevel(saved.access, false);
    upAutoFrom = saved.id;
    notes.push("Nhận diện theo tài liệu đã lưu “" + stripExt(saved.name) + "”: đã điền sẵn thông tin ban hành.");
  } else {
    upAutoFrom = null;
    if (fill("#upNumber", g.number)) notes.push("số " + g.number);
    if (fill("#upIssuer", g.issuer)) notes.push(g.issuer);
    if (notes.length) notes.splice(0, notes.length, "Nhận diện từ tên: " + notes.join(" · ") + ".");
  }
  $("#upAuto").textContent = notes.join(" ");
  if (notes.length) $("#upMore").open = $("#upMore").open || !!saved;
}
function setUpLevel(k, touched) {
  upLevel = k; if (touched) upLevelTouched = true;
  document.querySelectorAll("#upAccess [data-lv]").forEach(b => b.classList.toggle("on", b.dataset.lv === k));
  $("#upLvHint").textContent = LV[k].desc + ".";
}
function upFolderChanged() { const id = $("#upFolder").value; if (!upLevelTouched && tree[id]) setUpLevel(folderLevel(id), false); }
function renderUpList() {
  $("#upList").innerHTML = upFilesSel.map((f, i) => `<span class="chip">${esc(f.name)} <small>${fmtSize(f.size)}</small><button type="button" data-rmfile="${i}" aria-label="Bỏ tệp">×</button></span>`).join("");
  const one = upFilesSel.length + parseBulk($("#upLinks").value).length <= 1;
  $("#upName").disabled = !one;
  $("#upName").placeholder = one ? "Tự điền theo tên tệp; gõ để chọn tên đã lưu trước đó" : "Nhiều tài liệu: mỗi tài liệu lấy theo tên tệp / tên ghi trước dấu |";
  if (one && upFilesSel.length === 1 && !$("#upName").value) { $("#upName").value = cleanName(upFilesSel[0].name); applyAuto(upFilesSel[0].name); }
}
function addUpFiles(list) {
  const arr = [...list];
  if (!arr.length) return;
  upFilesSel = upFilesSel.concat(arr);
  renderUpList();
}

function openUpload(folderId, files) {
  if (!canUp()) { openLogin("Tải tài liệu lên cần tài khoản Thủ thư / Biên mục hoặc Quản trị."); return; }
  if (!settings) { toast("Chưa có cây thư mục. Quản trị viên bấm “Khởi tạo cây thư mục” trước.", "err"); return; }
  $("#upForm").reset(); $("#upErr").textContent = ""; $("#upMsg").textContent = ""; $("#upAuto").textContent = ""; upFilesSel = []; upCover.reset(); upLevelTouched = false; upAutoFrom = null;
  $("#upMore").open = false;
  $("#upFolder").innerHTML = allFolderOptions();
  $("#nameList").innerHTML = [...new Set(Object.values(items).map(f => cleanName(f.name)))].sort(vi.compare).slice(0, 600).map(n => `<option value="${esc(n)}">`).join("");
  $("#upAccess").innerHTML = LEVELS.filter(l => isAdmin || l.key !== "mat").map(l => `<button type="button" class="lv-btn lv-${l.key}" data-lv="${l.key}">${esc(l.name)}</button>`).join("");
  const h = decodeURIComponent(location.hash.slice(1)), cur = currentCatKey();
  const target = folderId && tree[folderId] ? folderId : (h.startsWith("f/") && tree[h.slice(2)] ? h.slice(2) : (cur ? catRootId(cur) : ""));
  if (target && tree[target]) $("#upFolder").value = target;
  setUpLevel(folderLevel($("#upFolder").value), false);
  $("#upTitle").textContent = "TẢI TÀI LIỆU LÊN";
  if (files && files.length) addUpFiles(files); else renderUpList();
  $("#dlgUpload").showModal();
}
function metaFrom(pref) {
  return { issuer: $(pref + "Issuer").value.trim(), number: $(pref + "Number").value.trim(), issued: $(pref + "Issued").value, effective: $(pref + "Effective").value, status: $(pref + "Status").value, note: $(pref + "Note").value.trim(), star: $(pref + "Star").checked };
}
function parseBulk(text) {
  return String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.*?)\s*\|\s*(\S+)\s*$/);
    return { line, name: m ? m[1].trim() : "", url: m ? m[2] : line };
  });
}
const isWebUrl = s => { try { const u = new URL(s); return /^https?:$/.test(u.protocol); } catch (e) { return false; } };
const nameFromUrl = s => { try { const u = new URL(s); return (u.hostname.replace(/^www\./, "") + decodeURIComponent(u.pathname.replace(/\/$/, ""))).slice(0, 120); } catch (e) { return s.slice(0, 120); } };
async function submitUpload(e) {
  e.preventDefault();
  let parent = $("#upFolder").value; const key = tree[parent] ? tree[parent].cat : "";
  const nameIn = $("#upName").disabled ? "" : $("#upName").value.trim(), newF = $("#upNewFolder").value.trim();
  const meta = { ...metaFrom("#up"), access: upLevel };
  const links = parseBulk($("#upLinks").value);
  const err = m => { $("#upErr").textContent = m; };
  if (!parent || !key) return err("Chọn thư mục lưu.");
  if (!upFilesSel.length && !links.length) return err("Kéo thả hoặc chọn tệp từ máy tính, hoặc dán đường link.");
  if (upFilesSel.some(f => f.size > 50 * 1024 * 1024)) return err("Có tệp lớn hơn 50 MB: hãy tải thẳng lên Google Drive rồi dán link vào ô bên dưới.");
  const bad = links.filter(b => !driveIdFrom(b.url) && !isWebUrl(b.url));
  if (bad.length) return err("Dòng chưa có đường link hợp lệ: " + bad.map(b => "“" + b.line.slice(0, 60) + "”").join("; "));
  if (links.length === 1 && !upFilesSel.length && !driveIdFrom(links[0].url) && !nameIn && !links[0].name) return err("Nhập tên văn bản cho đường link.");
  err(""); const btn = $("#upGo"); btn.disabled = true;
  const msg = t => { $("#upMsg").textContent = t; };
  const saved = [], fails = [], share = upLevel !== "mat", now = () => new Date().toISOString();
  try {
    if (newF) {
      msg("Đang tạo thư mục…");
      const f = await createFolder(newF, parent); const p = tree[parent];
      const node = { id: f.id, name: f.name, parent, cat: key, depth: (p ? p.depth : 1) + 1 };
      await setDoc(doc(db, "pnd_tree", f.id), node); tree[f.id] = node; parent = f.id;
      $("#upNewFolder").value = ""; $("#upFolder").innerHTML = allFolderOptions(); $("#upFolder").value = parent;
    }
    let cv = null;
    if (upCover.file) { msg("Đang tải ảnh bìa…"); cv = await uploadImage(upCover.file, "Bia-tai-lieu"); }
    const withCover = it => cv ? { ...it, coverUrl: cv.url, coverFileId: cv.id } : it;
    const single = upFilesSel.length + links.length === 1;
    let i = 0; const total = upFilesSel.length + links.length;
    for (const file of upFilesSel) {
      msg("Đang tải lên " + (++i) + "/" + total + ": " + file.name);
      try {
        const d = await uploadFile(file, parent);
        if (share) { try { await shareAnyone(d.id); d.permissionIds = (d.permissionIds || []).concat("anyoneWithLink"); } catch (x) { console.warn("chia sẻ", x.message); } }
        const g = guessMeta(file.name);
        const it = withCover({ ...fileItem(d, key, parent), fmime: d.mimeType || "", ...meta, number: meta.number || (single ? "" : g.number || ""), issuer: meta.issuer || (single ? "" : g.issuer || ""), name: single && nameIn ? nameIn : cleanName(d.name), added: now() });
        await setDoc(doc(db, "pnd_items", it.id), it); items[it.id] = it; saved.push(it);
      } catch (x) { fails.push(file.name + " — " + x.message); }
    }
    for (const b of links) {
      msg("Đang gắn " + (++i) + "/" + total + ": " + (b.name || b.url).slice(0, 70));
      try {
        const did = driveIdFrom(b.url);
        if (did) for (const it of await attachDrive(did, key, parent, meta, share, single ? (nameIn || b.name) : b.name)) {
          if (cv) { Object.assign(it, { coverUrl: cv.url, coverFileId: cv.id }); await setDoc(doc(db, "pnd_items", it.id), { coverUrl: cv.url, coverFileId: cv.id }, { merge: true }); }
          saved.push(it);
        } else {
          const it = withCover({ id: "lk-" + rid(), name: (single && nameIn) || b.name || nameFromUrl(b.url), mime: "link", link: b.url, cat: key, parent, shared: true, ...meta, added: now() });
          await setDoc(doc(db, "pnd_items", it.id), it); items[it.id] = it; saved.push(it);
        }
      } catch (x) { fails.push(b.line.slice(0, 80) + " — " + x.message); }
    }
    for (const it of saved) if (it.star) await syncStar(it);
    if (saved.length) await logAct("UPLOAD", saved.map(s => s.name).join("; ").slice(0, 900));
    if (fails.length) {
      msg(saved.length ? "Đã lưu " + saved.length + " tài liệu." : "");
      err("Chưa lưu được " + fails.length + " mục:\n" + fails.join("\n"));
      upFilesSel = []; renderUpList(); if (saved.length) route();
      return;
    }
    $("#dlgUpload").close();
    toast("Đã lưu " + saved.length + " tài liệu vào thư viện.", "ok");
    go("f/" + parent);
  } catch (x) { err(x.message || "Chưa lưu được."); msg(""); }
  finally { btn.disabled = false; }
}


/* ---------- Sửa thông tin tài liệu ---------- */
let editing = null;
function openEdit(id) {
  const f = items[id]; if (!f) return; editing = id;
  $("#edName").value = f.name || ""; $("#edIssuer").value = f.issuer || ""; $("#edNumber").value = f.number || ""; $("#edIssued").value = f.issued || ""; $("#edEffective").value = f.effective || ""; $("#edStatus").value = f.status || ""; $("#edNote").value = f.note || ""; $("#edStar").checked = !!f.star; $("#edErr").textContent = ""; $("#edMsg").textContent = "";
  $("#edAccess").innerHTML = LEVELS.filter(l => isAdmin || l.key !== "mat" || levelOf(f) === "mat").map(l => `<option value="${l.key}"${l.key === levelOf(f) ? " selected" : ""}>${esc(l.name)} — ${esc(l.desc)}</option>`).join("");
  edCover.reset(f.coverUrl || ""); $("#edCoverClear").hidden = !f.coverUrl;
  $("#dlgEdit").showModal();
}
async function submitEdit(e) {
  e.preventDefault(); const f = items[editing]; if (!f) return;
  const patch = { id: f.id, cat: f.cat, parent: f.parent, link: f.link || "", mime: f.mime || "", ...metaFrom("#ed"), access: $("#edAccess").value, name: $("#edName").value.trim() || f.name };
  const toMat = patch.access === "mat" && levelOf(f) !== "mat";
  const btn = $("#edGo"); btn.disabled = true;
  try {
    if (edCover.file) { $("#edMsg").textContent = "Đang tải ảnh bìa…"; const cv = await uploadImage(edCover.file, "Bia-tai-lieu"); patch.coverUrl = cv.url; patch.coverFileId = cv.id; }
    else if (edCover.clear) { patch.coverUrl = ""; patch.coverFileId = ""; }
    await setDoc(doc(db, "pnd_items", f.id), patch, { merge: true }); Object.assign(f, patch); await syncStar(f);
    $("#dlgEdit").close(); toast("Đã lưu thông tin.", "ok");
    if (toMat) await offerUnshare([f]);
    route();
  }
  catch (x) { $("#edErr").textContent = x.message; $("#edMsg").textContent = ""; }
  finally { btn.disabled = false; }
}
$("#edCoverClear").onclick = () => { edCover.markClear(); $("#edCoverClear").hidden = true; };

/* ---------- Tài khoản & phân quyền: tài khoản cá nhân và mã truy cập dùng chung, cùng một bộ vai trò ---------- */
let app2 = null;
async function createAuthUser(email, pw) {
  // Tạo người dùng bằng một phiên Firebase phụ để không làm quản trị viên bị đăng xuất
  app2 = app2 || initializeApp(CFG.FIREBASE, "pnd-cap-tai-khoan");
  const a2 = getAuth(app2);
  try { await createUserWithEmailAndPassword(a2, email, pw); }
  finally { try { await signOut(a2); } catch (e) {} }
}
const roleOpts = cur => Object.entries(ROLES).map(([k, r]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(r.name)}</option>`).join("");
const catChecks = (cls, allId) => `<div class="cat-checks"><label><input type="checkbox" id="${allId}" checked> <b>Tất cả danh mục</b></label>${PUBLIC_CATS.map(c => `<label><input type="checkbox" class="${cls}" value="${c.key}" disabled> ${esc(c.name)}</label>`).join("")}</div>`;
function bindCats(cls, allId) {
  const all = $("#" + allId), boxes = () => document.querySelectorAll("." + cls);
  all.onchange = () => boxes().forEach(x => { x.disabled = all.checked; if (x.disabled) x.checked = false; });
  return {
    get: () => all.checked ? ["*"] : [...boxes()].filter(x => x.checked).map(x => x.value),
    set: cs => { const a = !cs || !cs.length || cs.includes("*"); all.checked = a; boxes().forEach(x => { x.disabled = a; x.checked = !a && cs.includes(x.value); }); }
  };
}
const catsText = cs => !cs || cs.includes("*") ? "Tất cả" : cs.map(k => CAT[k] ? CAT[k].name : k).join(", ");
function matrixHTML() {
  const rows = [["Khách (chưa đăng nhập)", GUEST], ...Object.values(ROLES).map(r => [r.name, r])];
  return `<div class="tbl-wrap"><table class="adm-table matrix"><thead><tr><th>Vai trò</th>${LEVELS.map(l => `<th>${lvChip(l.key)}</th>`).join("")}<th>Tải về</th><th>Tải lên, quản lý</th></tr></thead><tbody>
    ${rows.map(([n, r]) => `<tr><td><b>${esc(n)}</b><br><span class="muted">${esc(r.desc)}</span></td>${LEVELS.map(l => `<td class="c">${r.levels.includes(l.key) ? "✓" : "—"}</td>`).join("")}<td class="c">${r.dl ? "✓" : "—"}</td><td class="c">${r.up ? "✓" : "—"}</td></tr>`).join("")}
  </tbody></table></div><p class="muted">Mỗi tài khoản hoặc mã còn có thể giới hạn theo danh mục. Mức truy cập đặt cho từng tài liệu, hoặc đặt cho thư mục để áp dụng chung (trang <a data-go="thu-muc" href="#thu-muc">Quản lý thư mục</a>).</p>`;
}
async function renderAccounts() {
  if (!isAdmin) {
    $("#main").innerHTML = `<section class="box"><h2 class="box-title">TÀI KHOẢN & PHÂN QUYỀN</h2><p class="empty">Chỉ quản trị viên hệ thống được cấp tài khoản và phân quyền.</p><div style="text-align:center;margin-top:12px"><button type="button" class="pill" data-adminlogin>ĐĂNG NHẬP QUẢN TRỊ</button></div>${navRow()}</section>`;
    return;
  }
  $("#main").innerHTML = `<section class="box"><h2 class="box-title">TÀI KHOẢN & PHÂN QUYỀN</h2>
    <div class="crumbs"><a data-home>Trang chủ</a><span class="sep">/</span><span>Tài khoản & phân quyền</span></div>
    <details class="panel-form" open><summary class="grp-title" style="margin:0;cursor:pointer">Bảng quyền theo vai trò</summary>${matrixHTML()}</details>

    <h3 class="grp-title">Cấp tài khoản</h3>
    <form id="acForm" class="panel-form" novalidate>
      <div class="grid2">
        <label class="fld"><span>Tên đăng nhập hoặc email Google *</span><input id="acUser" autocomplete="off" spellcheck="false" placeholder="Ví dụ: nguyenvana hoặc ten@gmail.com"></label>
        <label class="fld"><span>Mật khẩu khởi tạo <small class="muted">(để trống nếu chỉ đăng nhập bằng Google)</small></span><input id="acPass" type="text" autocomplete="new-password" placeholder="Ít nhất 6 ký tự"></label>
        <label class="fld"><span>Họ và tên *</span><input id="acName" maxlength="80"></label>
        <label class="fld"><span>Đơn vị / đối tượng</span><input id="acUnit" maxlength="80" placeholder="Ví dụ: Khoa Luật — Lớp LKT K12"></label>
        <label class="fld"><span>Vai trò</span><select id="acRole">${roleOpts("xem")}</select></label>
        <label class="fld"><span>Hạn sử dụng <small class="muted">(để trống: không giới hạn)</small></span><input id="acHan" type="date"></label>
      </div>
      <p class="hint" id="acRoleDesc"></p>
      <div class="fld" id="acCatsWrap"><span>Danh mục được xem</span>${catChecks("acCat", "acAll")}</div>
      <label class="fld chk inline" id="acDriveWrap" hidden><input type="checkbox" id="acDrive"><span>Cấp quyền chỉnh sửa thư mục PND trên Google Drive cho email này (cần để tải tệp lên)</span></label>
      <p class="err" id="acErr"></p><p class="muted" id="acMsg"></p>
      <div class="dlg-act"><button type="button" class="btn" id="acCancel" hidden>Hủy sửa</button><button type="submit" class="btn primary" id="acGo">Cấp tài khoản</button></div>
    </form>
    <h3 class="grp-title">Danh sách tài khoản <span class="muted" id="acCount"></span></h3>
    <div class="tbl-wrap"><table class="adm-table"><thead><tr><th>Tài khoản</th><th>Họ tên & đơn vị</th><th>Vai trò</th><th>Danh mục</th><th>Hạn</th><th>Trạng thái</th><th></th></tr></thead><tbody id="acBody"><tr><td colspan="7" class="muted">Đang tải…</td></tr></tbody></table></div>

    <h3 class="grp-title">Mã truy cập dùng chung</h3>
    <form id="maForm" class="panel-form" novalidate>
      <p class="muted">Một mã dùng chung cho nhiều người (ví dụ cả lớp). Mã mang một vai trò như tài khoản; người vượt quá số người cho phép sẽ bị từ chối.</p>
      <div class="grid2">
        <label class="fld"><span>Mã</span><input id="maCode" maxlength="24" placeholder="Ví dụ: PND2026" style="text-transform:uppercase" autocomplete="off"></label>
        <label class="fld"><span>Vai trò</span><select id="maRole">${roleOpts("xem")}</select></label>
        <label class="fld"><span>Số người được dùng mã</span><input id="maMax" type="number" min="1" max="1000" value="20"></label>
        <label class="fld"><span>Hết hạn ngày</span><input id="maHan" type="date"></label>
        <label class="fld" style="grid-column:1/-1"><span>Ghi chú</span><input id="maNote" maxlength="80" placeholder="Ví dụ: Tổ bộ môn Luật Dân sự"></label>
      </div>
      <div class="fld" style="margin-top:8px"><span>Danh mục được xem</span>${catChecks("maCat", "maAll")}</div>
      <p class="err" id="maErr"></p><p class="muted" id="maMsg"></p>
      <div class="dlg-act"><button type="button" class="btn" id="maCancel" hidden>Hủy sửa</button><button type="submit" class="btn primary" id="maGo">Cấp mã</button></div>
    </form>
    <div class="tbl-wrap"><table class="adm-table"><thead><tr><th>Mã</th><th>Ghi chú</th><th>Vai trò</th><th>Danh mục</th><th>Hạn dùng</th><th>Đã dùng</th><th>Trạng thái</th><th></th></tr></thead><tbody id="maBody"><tr><td colspan="8" class="muted">Đang tải…</td></tr></tbody></table></div>
    ${navRow()}</section>`;

  /* --- Tài khoản cá nhân --- */
  const acCats = bindCats("acCat", "acAll");
  let AC_EDIT = null, AC = [];
  const showRole = () => {
    const r = $("#acRole").value, isGoogle = /@/.test($("#acUser").value) && !$("#acUser").value.trim().toLowerCase().endsWith("@" + ACCT_DOMAIN);
    $("#acRoleDesc").textContent = ROLES[r].desc + ".";
    $("#acCatsWrap").hidden = r === "quan-tri";
    $("#acDriveWrap").hidden = !(ROLES[r].up && isGoogle && !AC_EDIT);
  };
  $("#acRole").onchange = showRole; $("#acUser").oninput = showRole; showRole();
  const acStop = () => { AC_EDIT = null; $("#acForm").reset(); $("#acUser").readOnly = false; acCats.set(["*"]); $("#acGo").textContent = "Cấp tài khoản"; $("#acCancel").hidden = true; $("#acPass").placeholder = "Ít nhất 6 ký tự"; showRole(); };
  $("#acCancel").onclick = acStop;
  async function acList() {
    try {
      AC = []; (await getDocs(collection(db, "pnd_accounts"))).forEach(d => AC.push({ id: d.id, ...d.data() }));
      AC.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
      $("#acCount").textContent = AC.length ? "(" + AC.length + ")" : "";
      $("#acBody").innerHTML = AC.length ? AC.map(x => {
        const st = x.disabled ? '<span class="badge bad">Đã khóa</span>' : x.han && todayISO() > x.han ? '<span class="badge bad">Hết hạn</span>' : '<span class="badge ok">Hoạt động</span>';
        return `<tr><td><b>${esc(showName(x.id))}</b><br><span class="muted">${x.login === "google" ? "Đăng nhập Google" : "Tên đăng nhập + mật khẩu"}</span></td><td>${esc(x.name || "")}<br><span class="muted">${esc(x.unit || "")}</span></td><td>${esc((ROLES[x.role] || {}).name || x.role)}</td><td>${esc(x.role === "quan-tri" ? "Tất cả" : catsText(x.cats))}</td><td>${x.han ? fmtDate(x.han) : "—"}</td><td>${st}</td>
          <td style="white-space:nowrap"><button type="button" class="btn sm" data-acedit="${esc(x.id)}">Sửa</button> <button type="button" class="btn sm" data-aclock="${esc(x.id)}">${x.disabled ? "Mở khóa" : "Khóa"}</button> <button type="button" class="btn sm" data-acdel="${esc(x.id)}">Xóa</button></td></tr>`;
      }).join("") : '<tr><td colspan="7" class="muted">Chưa có tài khoản nào.</td></tr>';
      $("#acBody").querySelectorAll("[data-acedit]").forEach(b => b.onclick = () => {
        const x = AC.find(y => y.id === b.dataset.acedit); AC_EDIT = x.id;
        $("#acUser").value = showName(x.id); $("#acUser").readOnly = true; $("#acPass").value = ""; $("#acPass").placeholder = "Không đổi mật khẩu khi sửa";
        $("#acName").value = x.name || ""; $("#acUnit").value = x.unit || ""; $("#acRole").value = x.role || "xem"; $("#acHan").value = x.han || ""; acCats.set(x.cats);
        $("#acGo").textContent = "Lưu thay đổi"; $("#acCancel").hidden = false; showRole(); $("#acForm").scrollIntoView({ behavior: "smooth" });
      });
      $("#acBody").querySelectorAll("[data-aclock]").forEach(b => b.onclick = async () => {
        const x = AC.find(y => y.id === b.dataset.aclock);
        try { await setDoc(doc(db, "pnd_accounts", x.id), { disabled: !x.disabled, updated: new Date().toISOString() }, { merge: true }); await logAct(x.disabled ? "ACCT_UNLOCK" : "ACCT_LOCK", x.id); acList(); }
        catch (e) { $("#acErr").textContent = e.message; }
      });
      $("#acBody").querySelectorAll("[data-acdel]").forEach(b => b.onclick = async () => {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Bấm lần nữa để xóa"; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Xóa"; } }, 4000); return; }
        try { await deleteDoc(doc(db, "pnd_accounts", b.dataset.acdel)); await logAct("ACCT_DEL", b.dataset.acdel); $("#acMsg").textContent = "Đã xóa quyền của tài khoản " + showName(b.dataset.acdel) + ". Người này giờ chỉ xem được tài liệu Công khai."; acList(); }
        catch (e) { $("#acErr").textContent = e.message; }
      });
    } catch (e) { $("#acBody").innerHTML = `<tr><td colspan="7" class="err">Chưa tải được danh sách: ${esc(e.message)}</td></tr>`; }
  }
  $("#acForm").onsubmit = async e => {
    e.preventDefault();
    const raw = $("#acUser").value.trim(), pw = $("#acPass").value, name = $("#acName").value.trim(), unit = $("#acUnit").value.trim(), role = $("#acRole").value, han = $("#acHan").value;
    const email = AC_EDIT || toEmail(raw), isGoogle = !email.endsWith("@" + ACCT_DOMAIN);
    const cats = role === "quan-tri" ? ["*"] : acCats.get();
    const err = m => { $("#acErr").textContent = m; };
    if (!AC_EDIT) {
      if (!raw) return err("Nhập tên đăng nhập hoặc email Google.");
      if (!isGoogle && !/^[a-z0-9._-]{3,30}@/.test(email)) return err("Tên đăng nhập 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới.");
      if (!isGoogle && pw.length < 6) return err("Tài khoản tên đăng nhập cần mật khẩu khởi tạo ít nhất 6 ký tự.");
      if (pw && pw.length < 6) return err("Mật khẩu cần ít nhất 6 ký tự.");
      if (AC.find(x => x.id === email)) return err("Tài khoản này đã có trong danh sách; bấm Sửa để đổi quyền.");
    }
    if (!name) return err("Nhập họ và tên.");
    if (!cats.length) return err("Chọn ít nhất một danh mục.");
    if (han && han < todayISO()) return err("Hạn sử dụng phải từ hôm nay trở đi.");
    err(""); const btn = $("#acGo"); btn.disabled = true; const notes = [];
    try {
      if (!AC_EDIT && pw) {
        try { await createAuthUser(email, pw); }
        catch (x) {
          if (x.code === "auth/email-already-in-use") notes.push("Tên đăng nhập đã có trong hệ thống đăng nhập: giữ mật khẩu cũ.");
          else if (x.code === "auth/operation-not-allowed") throw new Error("Firebase chưa bật đăng nhập Email/Mật khẩu (Authentication → Sign-in method).");
          else if (x.code === "auth/weak-password") throw new Error("Mật khẩu quá yếu (ít nhất 6 ký tự).");
          else throw x;
        }
      }
      const data = { email, username: showName(email), name, unit, role, cats, han: han || "", hanTs: han ? Timestamp.fromDate(new Date(han + "T23:59:59+07:00")) : null, login: pw || (AC_EDIT && (AC.find(x => x.id === AC_EDIT) || {}).login === "matkhau") ? "matkhau" : "google", ...(AC_EDIT ? { updated: new Date().toISOString() } : { created: new Date().toISOString(), by: user && user.email || "", disabled: false }) };
      await setDoc(doc(db, "pnd_accounts", email), data, { merge: !!AC_EDIT });
      if (!AC_EDIT && $("#acDrive").checked && !$("#acDriveWrap").hidden && settings && settings.rootId) {
        try {
          await drive(`https://www.googleapis.com/drive/v3/files/${settings.rootId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }) });
          notes.push("Đã cấp quyền chỉnh sửa thư mục PND trên Drive cho " + email + ".");
        } catch (x) { notes.push("Chưa cấp được quyền Drive: " + x.message); }
      }
      await logAct(AC_EDIT ? "ACCT_EDIT" : "ACCT_NEW", email + " · " + role);
      $("#acMsg").textContent = (AC_EDIT ? "Đã cập nhật tài khoản " : "Đã cấp tài khoản ") + showName(email) + ". " + (!AC_EDIT ? (isGoogle && !pw ? "Người dùng bấm “Đăng nhập bằng Google” với email này." : "Đăng nhập bằng tên “" + showName(email) + "” và mật khẩu vừa đặt.") : "") + (notes.length ? " " + notes.join(" ") : "");
      acStop(); acList();
    } catch (x) { err(x.message); } finally { btn.disabled = false; }
  };
  acList();

  /* --- Mã truy cập dùng chung --- */
  const maCats = bindCats("maCat", "maAll");
  const d6 = new Date(); d6.setMonth(d6.getMonth() + 6); const def = d6.getFullYear() + "-" + pad(d6.getMonth() + 1) + "-" + pad(d6.getDate());
  $("#maHan").value = def;
  let EDIT = null, LIST = [];
  const stop = () => { EDIT = null; $("#maForm").reset(); $("#maHan").value = def; $("#maCode").readOnly = false; maCats.set(["*"]); $("#maGo").textContent = "Cấp mã"; $("#maCancel").hidden = true; };
  $("#maCancel").onclick = stop;
  async function list() {
    try {
      const snap = await getDocs(collection(db, "pnd_ma")); LIST = [];
      for (const d of snap.docs) { const x = d.data(); LIST.push({ code: d.id, ...x, used: (await getDocs(collection(db, "pnd_ma", d.id, "luot"))).size }); }
      LIST.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
      const t = todayISO();
      $("#maBody").innerHTML = LIST.length ? LIST.map(x => { const exp = t > x.han, full = x.max && x.used >= x.max;
        return `<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.note || "")}</td><td>${esc((ROLES[x.role || "chuyen-muc"] || {}).name || "")}</td><td>${esc(catsText(x.cats))}</td><td>${fmtDate(x.han)}</td><td>${Math.min(x.used, x.max || x.used)} / ${x.max || "—"}</td><td>${exp ? '<span class="badge bad">Hết hạn</span>' : full ? '<span class="badge bad">Đủ người</span>' : '<span class="badge ok">Hiệu lực</span>'}</td><td style="white-space:nowrap"><button type="button" class="btn sm" data-maedit="${esc(x.code)}">Sửa</button> <button type="button" class="btn sm" data-madel="${esc(x.code)}">Xóa</button></td></tr>`; }).join("")
        : '<tr><td colspan="8" class="muted">Chưa có mã nào.</td></tr>';
      $("#maBody").querySelectorAll("[data-maedit]").forEach(b => b.onclick = () => { const x = LIST.find(y => y.code === b.dataset.maedit); EDIT = x.code; $("#maCode").value = x.code; $("#maCode").readOnly = true; $("#maRole").value = x.role || "chuyen-muc"; $("#maMax").value = x.max || 20; $("#maHan").value = x.han; $("#maNote").value = x.note || ""; maCats.set(x.cats); $("#maGo").textContent = "Lưu thay đổi"; $("#maCancel").hidden = false; $("#maForm").scrollIntoView({ behavior: "smooth" }); });
      $("#maBody").querySelectorAll("[data-madel]").forEach(b => b.onclick = async () => {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Bấm lần nữa để xóa"; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Xóa"; } }, 4000); return; }
        b.disabled = true; const code = b.dataset.madel;
        try { const ops = []; (await getDocs(collection(db, "pnd_ma", code, "luot"))).forEach(d => ops.push({ type: "del", ref: d.ref })); ops.push({ type: "del", ref: doc(db, "pnd_ma", code) }); await commitOps(ops); await logAct("CODE_DEL", code); $("#maMsg").textContent = "Đã xóa mã " + code + "."; list(); }
        catch (x) { $("#maErr").textContent = x.message; b.disabled = false; }
      });
    } catch (x) { $("#maBody").innerHTML = `<tr><td colspan="8" class="err">Chưa tải được danh sách: ${esc(x.message)}</td></tr>`; }
  }
  $("#maForm").onsubmit = async e => {
    e.preventDefault();
    const code = norm($("#maCode").value), max = parseInt($("#maMax").value, 10), han = $("#maHan").value, note = $("#maNote").value.trim(), role = $("#maRole").value;
    const cats = maCats.get();
    if (!okCode(code)) { $("#maErr").textContent = "Mã gồm 3–24 ký tự: chữ không dấu, chữ số, gạch ngang hoặc gạch dưới."; return; }
    if (role === "quan-tri" || role === "bien-muc") { $("#maErr").textContent = "Mã dùng chung không cấp quyền tải lên hay quản trị; hãy tạo tài khoản cá nhân cho vai trò này."; return; }
    if (!(max >= 1 && max <= 1000)) { $("#maErr").textContent = "Số người từ 1 đến 1000."; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(han) || han < todayISO()) { $("#maErr").textContent = "Chọn ngày hết hạn từ hôm nay trở đi."; return; }
    if (!cats.length) { $("#maErr").textContent = "Chọn ít nhất một danh mục."; return; }
    $("#maErr").textContent = ""; $("#maGo").disabled = true;
    try {
      const ref = doc(db, "pnd_ma", code);
      if (!EDIT && (await getDoc(ref)).exists()) throw new Error("Mã này đã có; hãy đặt mã khác.");
      const hanTs = Timestamp.fromDate(new Date(han + "T23:59:59+07:00"));
      await setDoc(ref, { note, han, hanTs, max, cats, role, ...(EDIT ? { updated: new Date().toISOString() } : { created: new Date().toISOString() }) }, { merge: !!EDIT });
      await logAct(EDIT ? "CODE_EDIT" : "CODE_NEW", code + " · " + role);
      $("#maMsg").textContent = (EDIT ? "Đã cập nhật mã " : "Đã cấp mã ") + code + "."; stop(); list();
    } catch (x) { $("#maErr").textContent = x.message; } finally { $("#maGo").disabled = false; }
  };
  list();
}

/* ---------- Bộ sưu tập (danh mục cấp 1) ---------- */
const ICON_NAMES = { doc: "Văn bản", cap: "Mũ tốt nghiệp", book: "Sách mở", board: "Bảng giảng", flask: "Nghiên cứu", run: "Thể thao", heart: "Sức khỏe", folder: "Thư mục", lib: "Thư viện", cal: "Lịch", mail: "Thư", cloud: "Đám mây", key: "Chìa khóa" };
const slugKey = n => "bst-" + fold(n).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
async function saveCatDefs(extra) {
  const catDefs = { ...(settings.catDefs || {}) }, cats = { ...settings.cats };
  if (extra) extra(catDefs, cats);
  await setDoc(doc(db, "pnd_settings", "root"), { catDefs, cats }, { merge: true });
  settings.catDefs = catDefs; settings.cats = cats; applyCatDefs();
}
function iconColorForm(icon, colorIdx) {
  return `<div class="grid2"><label class="fld"><span>Biểu tượng</span><select id="bsIcon">${Object.entries(ICON_NAMES).map(([k, v]) => `<option value="${k}"${k === icon ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
    <div class="fld"><span>Màu</span><div class="swatches" id="bsColor">${CAT_COLORS.map((c, i) => `<button type="button" class="sw${i === colorIdx ? " on" : ""}" data-sw="${i}" style="background:linear-gradient(135deg,${c[0]},${c[1]})" aria-label="Màu ${i + 1}"></button>`).join("")}</div></div></div>`;
}
const colorIdxOf = c => Math.max(0, CAT_COLORS.findIndex(x => x[0] === (c && c[0])));
async function addCollection() {
  if (!isAdmin) { toast("Chỉ quản trị viên được thêm bộ sưu tập.", "err"); return; }
  if (!settings) { toast("Chưa có cây thư mục.", "err"); return; }
  const name = (($("#bsName") || {}).value || "").trim();
  if (!name) { $("#bsErr").textContent = "Nhập tên bộ sưu tập."; return; }
  if (CATS.some(c => fold(c.name) === fold(name))) { $("#bsErr").textContent = "Đã có bộ sưu tập cùng tên."; return; }
  let key = slugKey(name), i = 2; while (CAT[key] || (settings.cats || {})[key]) key = slugKey(name) + "-" + i++;
  const icon = $("#bsIcon").value, color = CAT_COLORS[+(($("#bsColor .sw.on") || {}).dataset || {}).sw || 0];
  $("#bsGo").disabled = true; $("#bsErr").textContent = "";
  try {
    const f = await createFolder(name, settings.rootId);
    const order = Math.max(0, ...CATS.filter(c => c.key !== "cho").map(c => c.order)) + 1;
    await saveCatDefs((defs, cats) => { defs[key] = { name, icon, color, order, created: new Date().toISOString() }; cats[key] = f.id; });
    const node = { id: f.id, name, parent: settings.rootId, cat: key, depth: 1 };
    await setDoc(doc(db, "pnd_tree", f.id), node); tree[f.id] = node;
    await logAct("COLLECTION_NEW", name); toast("Đã thêm bộ sưu tập “" + name + "”.", "ok"); route();
  } catch (x) { $("#bsErr").textContent = "Chưa thêm được: " + x.message; } finally { const b = $("#bsGo"); if (b) b.disabled = false; }
}
async function editCollection(key) {
  const c = CAT[key]; if (!c || !isAdmin) return;
  const name = await ask("Tên bộ sưu tập “" + c.name + "”.", { title: "ĐỔI TÊN BỘ SƯU TẬP", input: "Tên mới", value: c.name, ok: "Lưu" });
  if (!name || name === c.name) return;
  try {
    const id = catRootId(key);
    if (id) await drive("https://www.googleapis.com/drive/v3/files/" + id + "?supportsAllDrives=true", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    await saveCatDefs(defs => { defs[key] = { ...(defs[key] || {}), name }; });
    if (id && tree[id]) { tree[id].name = name; await setDoc(doc(db, "pnd_tree", id), { name }, { merge: true }); }
    await logAct("COLLECTION_RENAME", c.name + " → " + name); toast("Đã đổi tên.", "ok"); route();
  } catch (x) { toast("Chưa đổi được tên: " + x.message, "err"); }
}
async function styleCollection(key) {
  const c = CAT[key]; if (!c || !isAdmin) return;
  const box = document.createElement("div"); box.innerHTML = iconColorForm(c.icon, colorIdxOf(c.color));
  const ok = await ask("Biểu tượng và màu của bộ sưu tập “" + c.name + "”.", { title: "GIAO DIỆN BỘ SƯU TẬP", node: box, ok: "Lưu" });
  if (ok === null) return;
  const icon = box.querySelector("#bsIcon").value, color = CAT_COLORS[+box.querySelector(".sw.on").dataset.sw];
  try { await saveCatDefs(defs => { defs[key] = { ...(defs[key] || {}), icon, color }; }); toast("Đã lưu.", "ok"); route(); }
  catch (x) { toast("Chưa lưu được: " + x.message, "err"); }
}
async function moveCollection(key, dir) {
  const list = CATS.filter(c => c.key !== "cho"), i = list.findIndex(c => c.key === key), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  try { await saveCatDefs(defs => list.forEach((c, n) => { defs[c.key] = { ...(defs[c.key] || {}), order: n }; })); route(); }
  catch (x) { toast("Chưa lưu được thứ tự: " + x.message, "err"); }
}
async function deleteCollection(key) {
  const c = CAT[key], id = catRootId(key); if (!c || !isAdmin || key === "cho") return;
  if ((id && (childrenOf(id).length || countFiles(id))) ) { toast("Bộ sưu tập còn thư mục hoặc tài liệu. Hãy chuyển hoặc xóa hết bên trong trước.", "err"); return; }
  if (!await ask("Xóa bộ sưu tập “" + c.name + "”? Thư mục trên Google Drive được chuyển vào Thùng rác (khôi phục được trong 30 ngày).", { title: "XÓA BỘ SƯU TẬP", ok: "Xóa" })) return;
  try {
    if (id) await drive("https://www.googleapis.com/drive/v3/files/" + id + "?supportsAllDrives=true", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    await saveCatDefs((defs, cats) => { if (BASE_CATS.some(b => b.key === key)) defs[key] = { ...(defs[key] || {}), removed: true }; else delete defs[key]; delete cats[key]; });
    if (id) { delete tree[id]; await deleteDoc(doc(db, "pnd_tree", id)); }
    await logAct("COLLECTION_DEL", c.name); toast("Đã xóa bộ sưu tập “" + c.name + "”.", "ok"); go("thu-muc");
  } catch (x) { toast("Chưa xóa được: " + x.message, "err"); }
}
document.addEventListener("click", e => { const sw = e.target.closest && e.target.closest(".sw[data-sw]"); if (!sw) return; sw.parentNode.querySelectorAll(".sw").forEach(x => x.classList.toggle("on", x === sw)); });

/* ---------- Quản lý thư mục: cây nhiều cấp, mức truy cập mặc định ---------- */
const lvOpts = (cur, inherit) => (inherit ? `<option value=""${!cur ? " selected" : ""}>Kế thừa thư mục cha</option>` : "") + LEVELS.map(l => `<option value="${l.key}"${l.key === cur ? " selected" : ""}>${esc(l.name)} — ${esc(l.desc)}</option>`).join("");
function renderFolders() {
  if (!canUp()) {
    $("#main").innerHTML = `<section class="box"><h2 class="box-title">QUẢN LÝ THƯ MỤC</h2><p class="empty">Chỉ Thủ thư / Biên mục và Quản trị viên được quản lý thư mục.</p>${navRow()}</section>`;
    return;
  }
  const rows = [];
  for (const c of visibleCats()) {
    const rootId = catRootId(c.key); if (!rootId || !tree[rootId]) continue;
    const walk = (id, lvl) => {
      const n = tree[id]; if (!n) return;
      const own = n.access, eff = folderLevel(id), cnt = countFiles(id);
      rows.push(`<tr class="${lvl === 0 ? "root" : ""}"><td><span class="tree-name" style="padding-left:${lvl * 20}px">${lvl === 0 ? `<span class="dot" style="background:${c.color[0]}"></span>` : "└ "}<a data-folder="${esc(id)}">${esc(lvl === 0 ? c.name : n.name)}</a></span>${n.desc ? `<br><span class="muted" style="padding-left:${lvl * 20 + 16}px">${esc(n.desc)}</span>` : ""}</td>
        <td>${lvChip(eff, own ? "" : " · kế thừa")}</td><td class="c">${cnt}</td>
        <td class="ftbl-act"><button type="button" class="btn sm" title="Thêm thư mục con" data-fnew="${esc(id)}">＋ Con</button><button type="button" class="btn sm" title="Mức truy cập" data-flevel="${esc(id)}">Quyền</button>${n.depth >= 2 ? `<button type="button" class="btn sm" data-fren="${esc(id)}">Đổi tên</button><button type="button" class="btn sm" data-movefolder="${esc(id)}">Chuyển</button><button type="button" class="btn sm" data-fimg="${esc(id)}">Bìa</button><button type="button" class="btn sm" data-fdesc="${esc(id)}">Mô tả</button><button type="button" class="btn sm danger" data-fdel="${esc(id)}">Xóa</button>` : ""}</td></tr>`);
      sortFolders(childrenOf(id)).forEach(k => walk(k.id, lvl + 1));
    };
    walk(rootId, 0);
  }
  const bsRows = CATS.filter(c => c.key !== "cho").map((c, i, arr) => `<tr><td><span class="tree-name"><span class="bs-ic">${cover(c.icon, c.color)}</span><a data-cat="${c.key}">${esc(c.name)}</a></span></td><td class="c">${catRootId(c.key) && tree[catRootId(c.key)] ? countFiles(catRootId(c.key)) : 0}</td>
      <td class="ftbl-act"><button type="button" class="btn sm" data-bsup="${c.key}"${i === 0 ? " disabled" : ""} title="Lên trên">↑</button><button type="button" class="btn sm" data-bsdown="${c.key}"${i === arr.length - 1 ? " disabled" : ""} title="Xuống dưới">↓</button><button type="button" class="btn sm" data-bsren="${c.key}">Đổi tên</button><button type="button" class="btn sm" data-bsstyle="${c.key}">Màu & biểu tượng</button><button type="button" class="btn sm" data-flevel="${esc(catRootId(c.key) || "")}">Quyền</button><button type="button" class="btn sm danger" data-bsdel="${c.key}">Xóa</button></td></tr>`).join("");
  $("#main").innerHTML = `<section class="box"><h2 class="box-title">QUẢN LÝ THƯ MỤC</h2>
    <div class="crumbs"><a data-home>Trang chủ</a><span class="sep">/</span><span>Quản lý thư mục</span></div>
    ${isAdmin ? `<form id="bsForm" class="panel-form" novalidate>
      <h3 class="grp-title" style="margin-top:0">Bộ sưu tập (danh mục lớn)</h3>
      <div class="tbl-wrap"><table class="adm-table ftbl"><thead><tr><th>Bộ sưu tập</th><th class="c">Tài liệu</th><th>Thao tác</th></tr></thead><tbody>${bsRows}</tbody></table></div>
      <h3 class="grp-title">Thêm bộ sưu tập</h3>
      <label class="fld"><span>Tên bộ sưu tập *</span><input id="bsName" maxlength="60" placeholder="Ví dụ: Luận án, luận văn"></label>
      ${iconColorForm("folder", 9)}
      <p class="err" id="bsErr"></p>
      <div class="dlg-act"><button type="submit" class="btn primary" id="bsGo">Thêm bộ sưu tập</button></div>
    </form>` : ""}
    <form id="fnForm" class="panel-form" novalidate>
      <h3 class="grp-title" style="margin-top:0">Thêm thư mục</h3>
      <div class="grid2">
        <label class="fld"><span>Tên thư mục *</span><input id="fnName" placeholder="Ví dụ: Luật Đất đai 2024 và các văn bản hướng dẫn thi hành"></label>
        <label class="fld"><span>Nằm trong thư mục</span><select id="fnParent">${allFolderOptions()}</select></label>
        <label class="fld"><span>Mức truy cập mặc định</span><select id="fnLevel">${lvOpts("", true)}</select></label>
        <label class="fld"><span>Mô tả ngắn</span><input id="fnDesc" maxlength="160"></label>
      </div>
      <p class="err" id="fnErr"></p>
      <div class="dlg-act"><button type="submit" class="btn primary" id="fnGo">Thêm thư mục</button></div>
    </form>
    <h3 class="grp-title">Cây thư mục</h3>
    <div class="tbl-wrap"><table class="adm-table ftbl"><thead><tr><th>Thư mục</th><th>Mức truy cập</th><th>Tài liệu</th><th>Thao tác</th></tr></thead><tbody>${rows.join("") || '<tr><td colspan="4" class="muted">Chưa có cây thư mục.</td></tr>'}</tbody></table></div>
    <p class="muted">Mức truy cập của thư mục là mức mặc định cho tài liệu tải vào thư mục đó và các thư mục con chưa đặt riêng. Khi đổi mức, có thể áp dụng luôn cho các tài liệu đang có bên trong. Thư mục cũng được tạo, đổi tên, chuyển và xóa (vào Thùng rác) trên Google Drive.</p>
    ${navRow()}</section>`;
  if (isAdmin) {
    $("#bsForm").onsubmit = e => { e.preventDefault(); addCollection(); };
    $("#bsForm").onclick = e => {
      const b = e.target.closest("[data-bsup],[data-bsdown],[data-bsren],[data-bsstyle],[data-bsdel]"); if (!b) return;
      const d = b.dataset;
      if (d.bsup) moveCollection(d.bsup, -1); else if (d.bsdown) moveCollection(d.bsdown, 1);
      else if (d.bsren) editCollection(d.bsren); else if (d.bsstyle) styleCollection(d.bsstyle); else if (d.bsdel) deleteCollection(d.bsdel);
    };
    if (location.hash.includes("them-bst")) setTimeout(() => { $("#bsName").scrollIntoView({ behavior: "smooth", block: "center" }); $("#bsName").focus(); }, 50);
  }
  $("#fnForm").onsubmit = async e => {
    e.preventDefault();
    const name = $("#fnName").value.trim(), parent = $("#fnParent").value, lv = $("#fnLevel").value, desc = $("#fnDesc").value.trim();
    if (!name) { $("#fnErr").textContent = "Nhập tên thư mục."; return; }
    if (!tree[parent]) { $("#fnErr").textContent = "Chọn thư mục cha."; return; }
    $("#fnErr").textContent = ""; $("#fnGo").disabled = true;
    try {
      const p = tree[parent], f = await createFolder(name, parent);
      const node = { id: f.id, name: f.name, parent, cat: p.cat, depth: p.depth + 1, ...(lv ? { access: lv } : {}), ...(desc ? { desc } : {}) };
      await setDoc(doc(db, "pnd_tree", f.id), node); tree[f.id] = node;
      await logAct("FOLDER_NEW", name); toast("Đã tạo thư mục “" + name + "”.", "ok"); route();
    } catch (x) { $("#fnErr").textContent = "Chưa tạo được thư mục: " + x.message; } finally { $("#fnGo").disabled = false; }
  };
}
async function setFolderLevel(id) {
  const n = tree[id]; if (!n || !canUp()) return;
  const label = n.depth <= 1 ? CAT[n.cat].name : n.name;
  const lv = await ask("Mức truy cập mặc định của thư mục “" + label + "” (hiện tại: " + LV[folderLevel(id)].name + (n.access ? "" : ", kế thừa") + ").", { title: "MỨC TRUY CẬP THƯ MỤC", options: lvOpts(n.access || "", n.depth >= 2), ok: "Lưu" });
  if (lv === null) return;
  if (lv === "mat" && !isAdmin) { toast("Chỉ quản trị viên được đặt mức Mật.", "err"); return; }
  try {
    await setDoc(doc(db, "pnd_tree", id), { access: lv || "" }, { merge: true });
    if (lv) n.access = lv; else delete n.access;
    const eff = folderLevel(id), ids = subtreeIds(id);
    const inside = Object.values(items).filter(f => ids.includes(f.parent) && levelOf(f) !== eff);
    if (inside.length && await ask("Áp dụng mức “" + LV[eff].name + "” cho " + inside.length + " tài liệu đang nằm trong thư mục này (và thư mục con)?", { title: "ÁP DỤNG CHO TÀI LIỆU", ok: "Áp dụng" })) {
      await commitOps(inside.map(f => ({ type: "merge", ref: doc(db, "pnd_items", f.id), data: { access: eff } })));
      inside.forEach(f => f.access = eff);
      if (eff === "mat") await offerUnshare(inside);
    }
    await logAct("FOLDER_LEVEL", label + " → " + (lv || "kế thừa"));
    toast("Đã đặt mức truy cập cho “" + label + "”.", "ok"); route();
  } catch (x) { toast("Chưa lưu được: " + x.message, "err"); }
}
/* Tài liệu chuyển sang Mật: đề nghị tắt chia sẻ “bất kỳ ai có link” trên Drive */
async function offerUnshare(list) {
  const shared = list.filter(f => driveIdOf(f) && f.shared !== false);
  if (!shared.length) return;
  if (!await ask("Tắt chia sẻ “Bất kỳ ai có đường liên kết” trên Google Drive cho " + shared.length + " tệp Mật? Nếu không tắt, ai đã có đường link vẫn mở được tệp.", { title: "TÀI LIỆU MẬT", ok: "Tắt chia sẻ" })) return;
  let ok = 0;
  for (const f of shared) {
    try { await drive(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveIdOf(f))}/permissions/anyoneWithLink?supportsAllDrives=true`, { method: "DELETE" }); f.shared = false; await setDoc(doc(db, "pnd_items", f.id), { shared: false }, { merge: true }); ok++; }
    catch (e) { console.warn("tắt chia sẻ", f.name, e.message); }
  }
  toast("Đã tắt chia sẻ link cho " + ok + "/" + shared.length + " tệp.", ok === shared.length ? "ok" : "err");
}
async function setFolderDesc(id) {
  const n = tree[id]; if (!n) return;
  const d = await ask("Mô tả ngắn cho thư mục “" + n.name + "”.", { title: "MÔ TẢ THƯ MỤC", input: "Mô tả", value: n.desc || "", ok: "Lưu" });
  if (d === null) return;
  try { await setDoc(doc(db, "pnd_tree", id), { desc: d }, { merge: true }); n.desc = d; route(); } catch (x) { toast("Chưa lưu được: " + x.message, "err"); }
}


/* ---------- Hỏi AI (Gemini qua Firebase AI Logic) ---------- */
let aiChat = null, aiInst = null;
async function getAIInst() {
  if (aiInst) return aiInst;
  if (!CFG.APPCHECK_SITE_KEY) throw new Error("Trợ lý AI đang chờ kích hoạt (cần hoàn tất đăng ký Gemini và App Check).");
  const [{ initializeAppCheck, ReCaptchaEnterpriseProvider }, aiMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-check.js"),
    import("https://www.gstatic.com/firebasejs/12.0.0/firebase-ai.js")
  ]);
  try { initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(CFG.APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true }); } catch (e) {}
  aiInst = { mod: aiMod, ai: aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() }) };
  return aiInst;
}

/* Chọn mẫu Gemini: dùng mẫu trong cấu hình; nếu Google đã ngừng mẫu đó thì tự chuyển sang mẫu dự phòng và nhớ lại */
const AI_MODELS = [...new Set([CFG.AI_MODEL, "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"].filter(Boolean))];
let aiModelIdx = (() => { try { const k = localStorage.getItem("pnd_ai_model"); const i = AI_MODELS.indexOf(k); return i >= 0 ? i : 0; } catch (e) { return 0; } })();
const aiModelGone = e => /\b404\b|no longer available|not found|not supported|deprecated|retired|unknown model|limit: 0\b/i.test((e && e.message) || "");
function aiNextModel() { if (aiModelIdx >= AI_MODELS.length - 1) return false; aiModelIdx++; try { localStorage.setItem("pnd_ai_model", AI_MODELS[aiModelIdx]); } catch (e) {} return true; }
function aiWrap(opts) {
  return { async generateContent(req) {
    const { mod, ai } = await getAIInst();
    for (;;) {
      try { return await mod.getGenerativeModel(ai, { ...opts, model: AI_MODELS[aiModelIdx] }).generateContent(req); }
      catch (e) { if (!aiModelGone(e) || !aiNextModel()) throw e; }
    }
  } };
}
function aiAdd(cls, text) { const p = document.createElement("div"); p.className = "ai-msg " + cls; p.textContent = text; $("#aiLog").appendChild(p); $("#aiLog").scrollTop = 1e9; return p; }
function contextText() {
  const lines = Object.values(items).filter(f => canSee(f)).slice(0, 700).map(f => "- [" + pathOf(f.parent).map(p => p.name).join(" > ") + "] " + f.name + (f.issuer ? "; ban hành bởi " + f.issuer : "") + (f.issued ? "; ngày " + fmtDate(f.issued) : "") + (f.number ? "; số " + f.number : "") + (f.effective ? "; hiệu lực từ " + fmtDate(f.effective) : "") + (f.status ? "; " + f.status : "") + (f.note ? "; ghi chú: " + f.note : ""));
  return lines.length ? lines.join("\n") : "(chưa có tài liệu nào trong phạm vi người dùng được xem)";
}
async function getChat() {
  if (aiChat) return aiChat;
  const { mod, ai } = await getAIInst();
  const model = mod.getGenerativeModel(ai, { model: AI_MODELS[aiModelIdx], systemInstruction: "Bạn là trợ lý của thư viện số Phúc Nguyên Digital (tài liệu pháp luật, quy chế, chương trình đào tạo, giảng dạy, nghiên cứu). Trả lời bằng tiếng Việt, ngắn gọn, chính xác. Khi câu hỏi liên quan tới tài liệu trong thư viện, chỉ ra tên tài liệu và thư mục chứa nó dựa trên danh mục được cung cấp. Nếu danh mục không có thông tin, nói rõ là thư viện chưa có và trả lời theo hiểu biết chung kèm lưu ý cần kiểm tra văn bản gốc còn hiệu lực. Không bịa số hiệu văn bản." });
  aiChat = model.startChat({ history: [{ role: "user", parts: [{ text: "Danh mục tài liệu tôi được xem trong thư viện:\n" + contextText() }] }, { role: "model", parts: [{ text: "Đã nhận danh mục. Mời bạn đặt câu hỏi." }] }] });
  return aiChat;
}
function openAI() {
  if (!$("#aiLog").children.length) aiAdd("bot", "Xin chào! Bạn muốn tìm tài liệu hay hỏi điều gì?");
  $("#dlgAI").showModal(); setTimeout(() => $("#aiInput").focus(), 50);
}
async function askAI(e) {
  e.preventDefault(); const q = $("#aiInput").value.trim(); if (!q) return;
  $("#aiInput").value = ""; aiAdd("me", q); const bot = aiAdd("bot", "…");
  try {
    const chat = await getChat();
    const r = await chat.sendMessageStream(q); let txt = "";
    for await (const ch of r.stream) { txt += ch.text(); bot.textContent = txt; $("#aiLog").scrollTop = 1e9; }
    if (!txt) bot.textContent = "(Không có câu trả lời.)";
  } catch (x) {
    aiChat = null;
    if (aiModelGone(x) && aiNextModel()) { bot.textContent = "…"; $("#aiInput").value = q; $("#aiLog").removeChild(bot); $("#aiLog").lastChild && $("#aiLog").removeChild($("#aiLog").lastChild); return askAI(e); }
    bot.textContent = "Chưa hỏi được: " + (x.message || x);
  }
}

/* ---------- Ghi âm → chữ trực tiếp trong văn bản ghi chú ---------- */
// Bấm 🎤 Ghi âm: nói đến đâu chữ hiện vào văn bản đến đó (chữ xám = đang nghe). Chỉ dừng khi bấm ⏹ Dừng.
// Độ nhạy: micro được tự cân mức, lọc ồn và khuếch đại trước khi nhận dạng (trình duyệt hỗ trợ); Gemini thêm dấu câu cho từng câu.
let dict = null, punctModel = null;
function cleanDictHTML(sheet) {
  const c = sheet.cloneNode(true);
  c.querySelectorAll(".dict-interim").forEach(sp => sp.remove());
  c.querySelectorAll(".dict-pending").forEach(sp => sp.replaceWith(document.createTextNode(sp.textContent)));
  c.querySelectorAll(".pg-break").forEach(b => { b.removeAttribute("style"); b.removeAttribute("contenteditable"); });
  return c.innerHTML;
}
function dictSetUI(on) {
  const b = document.querySelector("[data-dictate]");
  if (b) { b.classList.toggle("on", on); b.textContent = on ? (dict && dict.meeting ? "⏹ Dừng ghi cuộc họp" : "⏹ Dừng") : "🎤 Ghi âm"; }
  const m = $("#btnRec"), mtg = on && dict && dict.meeting;
  if (m) { m.classList.toggle("rec-on", !!mtg); m.textContent = mtg ? "● Đang ghi cuộc họp" : "🎙 Ghi âm cuộc họp"; }
}
function dictCaretRange(sheet) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && sheet.contains(sel.getRangeAt(0).startContainer)) { const r = sel.getRangeAt(0).cloneRange(); r.collapse(false); return r; }
  const r = document.createRange();
  const last = sheet.lastElementChild;
  if (last && /^(P|DIV|H\d|BLOCKQUOTE|LI)$/.test(last.tagName)) r.selectNodeContents(last); else r.selectNodeContents(sheet);
  r.collapse(false); return r;
}
function toggleDictation() { if (dict) stopDictation(); else startDictation(); }
// Luồng micro đã khuếch đại (tăng độ nhạy) — dùng nếu trình duyệt cho phép nhận dạng từ luồng riêng
async function dictBoostedTrack() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true, noiseSuppression: true, echoCancellation: true, channelCount: 1 } });
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain(); gain.gain.value = 2.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -40; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.2;
    const dest = ctx.createMediaStreamDestination();
    src.connect(gain); gain.connect(comp); comp.connect(dest);
    return { track: dest.stream.getAudioTracks()[0], stop: () => { stream.getTracks().forEach(t => t.stop()); try { ctx.close(); } catch (e) {} } };
  } catch (e) { return null; }
}
async function startDictation(opts) {
  const meeting = !!(opts && opts.meeting);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const sheet = $("#inFileSheet");
  if (!sheet) return;
  if (!SR) { toast("Trình duyệt này chưa hỗ trợ ghi âm thành chữ. Sếp dùng Chrome hoặc Edge; trên iPhone/iPad dùng nút micro của bàn phím.", "err"); return; }
  let range = dictCaretRange(sheet);
  if (meeting) { range = document.createRange(); range.selectNodeContents(sheet); range.collapse(false); }
  const d = dict = { meeting, t0: Date.now(), lastFinal: 0, para: null, wake: null, sheet, range, queue: [], busy: false, ctx: stripHtmlText(sheet.innerHTML).slice(-300), fails: 0, interim: null, boost: null, useTrack: false, rec: null };
  dictSetUI(true);
  d.boost = await dictBoostedTrack();
  if (dict !== d) { if (d.boost) d.boost.stop(); return; }
  d.useTrack = !!d.boost;
  const launch = () => {
    const rec = new SR();
    rec.lang = "vi-VN"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = ev => {
      if (dict !== d || d.rec !== rec) return;
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i], txt = (r[0] && r[0].transcript || "").trim();
        if (!txt) continue;
        if (r.isFinal) { dictShowInterim(d, ""); if (d.meeting) mtgInsert(d, txt); else dictInsert(d, txt); } else interim += txt + " ";
      }
      dictShowInterim(d, interim.trim());
    };
    rec.onerror = ev => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { toast("Chưa được dùng micro. Sếp bấm biểu tượng ổ khóa cạnh địa chỉ web → cho phép Micro, rồi bấm lại 🎤.", "err"); stopDictation(); }
      else if (ev.error === "audio-capture") { toast("Không tìm thấy micro trên máy.", "err"); stopDictation(); }
    };
    rec.onend = () => {
      if (dict !== d || d.rec !== rec) return;
      // Trình duyệt tự ngắt (im lặng, mạng): nối lại ngay — chỉ dừng khi sếp bấm ⏹ Dừng
      setTimeout(() => { if (dict === d && d.rec === rec) { try { launch(); d.fails = 0; } catch (e) { if (++d.fails > 5) { toast("Mất kết nối nhận dạng giọng nói, đã dừng ghi.", "err"); stopDictation(); } } } }, 200);
    };
    d.rec = rec;
    if (d.useTrack) { try { rec.start(d.boost.track); return; } catch (e) { d.useTrack = false; if (d.boost) { d.boost.stop(); d.boost = null; } } }
    rec.start();
  };
  try { launch(); } catch (e) { dict = null; dictSetUI(false); if (d.boost) d.boost.stop(); toast("Không bật được micro: " + (e.message || e), "err"); return; }
  if (meeting) { try { if (navigator.wakeLock) d.wake = await navigator.wakeLock.request("screen"); } catch (e) {} }
  const keep = d.range.cloneRange();
  sheet.focus();
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(keep); }
  d.range = keep.cloneRange();
}
// Chữ đang nghe (xám) hiện ngay tại vị trí ghi trong văn bản
function dictShowInterim(d, txt) {
  if (!txt) { if (d.interim) { d.interim.remove(); d.interim = null; } return; }
  if (!d.interim || !d.interim.isConnected) {
    d.interim = document.createElement("span"); d.interim.className = "dict-interim";
    const r = d.range.cloneRange(); r.insertNode(d.interim);
  }
  d.interim.textContent = " " + txt;
}
function stopDictation() {
  if (!dict) return;
  const d = dict; dict = null;
  // Phần đang nghe dở: đưa luôn vào văn bản
  const rest = d.interim && d.interim.isConnected ? d.interim.textContent.trim() : "";
  if (d.interim) { d.interim.remove(); d.interim = null; }
  if (rest) { if (d.meeting) mtgInsert(d, rest, true); else dictInsert(d, rest, true); }
  try { if (d.wake) d.wake.release(); } catch (e) {}
  try { if (d.rec) { d.rec.onend = null; d.rec.onresult = null; d.rec.stop(); } } catch (e) {}
  if (d.boost) d.boost.stop();
  dictSetUI(false);
  dictDrain(d);
}
// Bấm sang chỗ khác trong văn bản thì chữ ghi tiếp sẽ vào chỗ đó
document.addEventListener("selectionchange", () => {
  if (!dict || dict.meeting) return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount && dict.sheet.contains(sel.getRangeAt(0).startContainer) && !(dict.interim && dict.interim.contains(sel.getRangeAt(0).startContainer))) { const r = sel.getRangeAt(0).cloneRange(); r.collapse(false); dict.range = r; }
});
function dictInsert(d, raw, force) {
  if (!d || (!force && dict !== d) || !d.sheet.isConnected) return;
  const r = d.range;
  let prev = "";
  try { const pr = document.createRange(); pr.setStart(d.sheet, 0); pr.setEnd(r.startContainer, r.startOffset); prev = pr.toString(); } catch (e) {}
  const lead = prev && !/\s$/.test(prev) ? " " : "";
  const sp = document.createElement("span");
  sp.className = "dict-pending"; sp.textContent = lead + raw;
  r.insertNode(sp);
  r.setStartAfter(sp); r.collapse(true);
  const sel = window.getSelection();
  if (dict === d && document.activeElement === d.sheet && sel) { sel.removeAllRanges(); sel.addRange(r.cloneRange()); }
  d.sheet.dispatchEvent(new Event("input"));
  d.queue.push({ sp, raw, lead });
  dictDrain(d);
}
/* Ghi cuộc họp (phương án A): chữ nhận dạng trực tiếp ghi nối vào cuối ghi chú, không gửi Gemini.
   Ngắt quãng trên 8 giây thì sang đoạn mới, đầu đoạn có mốc thời gian [mm:ss]. */
const MTG_GAP = 8000;
function mtgInsert(d, raw, force) {
  if (!d || (!force && dict !== d) || !d.sheet.isConnected) return;
  const now = Date.now();
  if (!d.para || !d.para.isConnected || now - d.lastFinal > MTG_GAP) {
    d.para = document.createElement("p");
    const ts = document.createElement("span"); ts.style.color = "#64748b"; ts.textContent = "[" + recFmt((now - d.t0) / 1000) + "]";
    d.para.appendChild(ts);
    d.sheet.appendChild(d.para);
  }
  d.lastFinal = now;
  d.para.appendChild(document.createTextNode(" " + raw.trim()));
  const r = document.createRange(); r.selectNodeContents(d.para); r.collapse(false); d.range = r;
  d.para.scrollIntoView({ block: "nearest" });
  d.sheet.dispatchEvent(new Event("input"));
}
async function mtgStart() {
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { toast("Trình duyệt này chưa hỗ trợ ghi âm thành chữ. Sếp dùng Chrome hoặc Edge trên máy tính.", "err"); return; }
  if ($("#dlgRec").open) $("#dlgRec").close();
  stopDictation();
  const st = new Date();
  const name = "Ghi âm cuộc họp " + st.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  const html = `<h2 style="margin-top:0">${esc(name)}</h2><p><i>Chép lời trực tiếp bằng nhận dạng giọng nói của trình duyệt — cần rà lại những chỗ quan trọng.</i></p>`;
  await createNoteDocument(catRootId("bst-ghi-chu"), name, "blank", html);
  if (!$("#inFileSheet")) { toast("Chưa mở được ghi chú để ghi.", "err"); return; }
  await startDictation({ meeting: true });
  if (dict && dict.meeting) toast("Đang ghi cuộc họp. Chữ chạy thẳng vào ghi chú này. Bấm “⏹ Dừng ghi cuộc họp” để kết thúc; đóng ghi chú cũng sẽ dừng ghi.", "ok");
}
function basicPunct(raw, ctx) {
  let t = raw.trim(); if (!t) return t;
  if (!ctx.trim() || /[.!?…:]\s*$/.test(ctx)) t = t.charAt(0).toLocaleUpperCase("vi") + t.slice(1);
  if (!/[.!?…,;:]$/.test(t)) t += ".";
  return t;
}
async function getPunctModel() {
  if (punctModel) return punctModel;
  const { mod, ai } = await getAIInst();
  punctModel = aiWrap({
    systemInstruction: "Bạn là bộ chuẩn hóa văn bản đọc chính tả tiếng Việt. Nhiệm vụ duy nhất: thêm dấu câu và viết hoa đúng chính tả tiếng Việt (đầu câu, tên riêng, tên cơ quan, tên văn bản pháp luật). Giữ nguyên từng từ, thứ tự từ; không thêm, bớt, diễn đạt lại hay giải thích. Chỉ trả về đúng đoạn mới đã chuẩn hóa."
  });
  return punctModel;
}
async function punctuate(raw, ctx) {
  const m = await getPunctModel();
  const prompt = (ctx.trim() ? "Đoạn văn ngay trước (chỉ để tham khảo ngữ cảnh, KHÔNG lặp lại):\n«" + ctx.slice(-300) + "»\n\n" : "") + "Đoạn mới cần thêm dấu câu và viết hoa:\n«" + raw + "»";
  const r = await m.generateContent(prompt);
  const out = (r.response.text() || "").trim().replace(/^[«"“]+|[»"”]+$/g, "").trim();
  const norm = x => x.toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const a = norm(raw).split(" "), b = norm(out).split(" ");
  if (!out || b.length > a.length * 1.5 + 3 || b.length < a.length * 0.6) return basicPunct(raw, ctx);
  return out;
}
async function dictDrain(d) {
  if (d.busy) return;
  d.busy = true;
  while (d.queue.length) {
    const job = d.queue.shift();
    let out;
    try { out = await punctuate(job.raw, d.ctx); } catch (e) { console.warn("Thêm dấu câu:", e.message); out = basicPunct(job.raw, d.ctx); }
    d.ctx = (d.ctx + " " + out).slice(-600);
    if (job.sp.isConnected) {
      // Chèn chữ đã có dấu TRƯỚC thẻ tạm rồi gỡ thẻ tạm → giữ đúng thứ tự nói
      const tn = document.createTextNode(job.lead + out);
      job.sp.before(tn);
      job.sp.remove();
      d.sheet.dispatchEvent(new Event("input"));
    }
  }
  d.busy = false;
}


/* ---------- Ghi âm cuộc họp → chuyển thành văn bản (thủ công, sau khi ghi xong) ---------- */
// Ghi: micro tăng độ nhạy (tự cân mức + khuếch đại + nén). Một bản ghi liền để nghe lại/tải về;
// song song cắt các đoạn ~5 phút để Gemini chép lời từng đoạn khi bấm "Chuyển thành văn bản".
const REC_PIECE = 300;          // giây mỗi đoạn gửi Gemini
let rec = null;                 // phiên ghi đang chạy
let recDone = null;             // bản ghi đã xong: { name, full: Blob, pieces: [Blob]|null, file: File|null, dur }
let recModel = null;
function recFmt(sec) { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(x).padStart(2, "0"); }
function recElapsed() { if (!rec) return 0; return rec.acc + (rec.paused ? 0 : (performance.now() - rec.since) / 1000); }
function recUI() {
  const on = !!rec;
  $("#recStart").disabled = on; $("#recPause").disabled = !on; $("#recStop").disabled = !on;
  $("#recPause").textContent = rec && rec.paused ? "▶ Ghi tiếp" : "⏸ Tạm dừng";
  $("#recFileLbl").classList.toggle("disabled", on); $("#recFile").disabled = on;
  $("#btnRec").textContent = on ? (rec.paused ? "⏸ Đang tạm dừng " : "● Đang ghi ") + recFmt(recElapsed()) : "🎙 Ghi âm cuộc họp";
  $("#btnRec").classList.toggle("rec-on", on && !rec.paused);
}
function recShowResult() {
  const box = $("#recResult");
  if (!recDone) { box.hidden = true; return; }
  box.hidden = false;
  $("#recName").textContent = recDone.name + (recDone.dur ? " · " + recFmt(recDone.dur) : "");
  const a = $("#recAudio"); if (a.src) URL.revokeObjectURL(a.src);
  a.src = URL.createObjectURL(recDone.full);
  $("#recSave").hidden = !!recDone.file;
  $("#recTrans").disabled = false;
  $("#recProg").textContent = "";
}
function openRec() { recUI(); recShowResult(); const d = $("#dlgRec"); if (!d.open) d.showModal(); }
async function recStart() {
  if (rec) return;
  if (!window.MediaRecorder || !navigator.mediaDevices) { toast("Trình duyệt chưa hỗ trợ ghi âm. Sếp dùng Chrome hoặc Edge bản mới.", "err"); return; }
  if (recDone && !recDone.saved && !await ask("Bản ghi trước chưa chuyển thành văn bản hoặc tải về. Ghi mới sẽ thay bản đó. Tiếp tục?")) return;
  stopDictation();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true, noiseSuppression: false, echoCancellation: false, channelCount: 1 } }); }
  catch (e) { toast("Chưa được dùng micro. Sếp bấm biểu tượng ổ khóa cạnh địa chỉ web → cho phép Micro, rồi bấm lại.", "err"); return; }
  // Tăng độ nhạy: khuếch đại + nén để giọng nhỏ/ở xa vẫn rõ, giọng to không bị vỡ
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain(); gain.gain.value = 3;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -45; comp.knee.value = 25; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25;
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  const dest = ctx.createMediaStreamDestination();
  src.connect(gain); gain.connect(comp); comp.connect(dest); comp.connect(an);
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
  const opt = mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : {};
  const full = new MediaRecorder(dest.stream, opt), fullParts = [];
  full.ondataavailable = e => { if (e.data && e.data.size) fullParts.push(e.data); };
  rec = { stream, ctx, dest, an, opt, full, fullParts, pieces: [], piece: null, acc: 0, since: performance.now(), paused: false, pieceAt: 0, started: new Date(), wake: null };
  full.start(1000);
  recNewPiece();
  try { if (navigator.wakeLock) rec.wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  rec.timer = setInterval(recTick, 250);
  recDone = null; recShowResult(); recUI();
}
function recNewPiece() {
  const r = new MediaRecorder(rec.dest.stream, rec.opt), parts = [];
  r.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
  const p = { r, parts, done: null };
  p.done = new Promise(res => { r.onstop = () => res(new Blob(parts, { type: r.mimeType || "audio/webm" })); });
  r.start(1000);
  rec.pieces.push(p); rec.piece = p; rec.pieceAt = recElapsed();
}
function recTick() {
  if (!rec) return;
  const t = recElapsed();
  $("#recClock").textContent = (rec.paused ? "⏸ " : "● ") + recFmt(t);
  // Thanh mức tiếng: cho sếp thấy micro có bắt được tiếng hay không
  const buf = new Uint8Array(rec.an.fftSize); rec.an.getByteTimeDomainData(buf);
  let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
  $("#recLevel").style.width = (rec.paused ? 0 : Math.min(100, peak / 128 * 140)) + "%";
  if (!rec.paused && t - rec.pieceAt >= REC_PIECE) { const old = rec.piece; recNewPiece(); setTimeout(() => { try { old.r.stop(); } catch (e) {} }, 2000); }
  if (Math.floor(t * 4) % 4 === 0) recUI();
}
function recPause() {
  if (!rec) return;
  if (rec.paused) { rec.full.resume(); rec.piece.r.resume(); rec.since = performance.now(); rec.paused = false; }
  else { rec.full.pause(); rec.piece.r.pause(); rec.acc += (performance.now() - rec.since) / 1000; rec.paused = true; }
  recUI();
}
async function recStop() {
  if (!rec) return;
  const r = rec; const dur = recElapsed();
  clearInterval(r.timer);
  const fullDone = new Promise(res => { r.full.onstop = () => res(new Blob(r.fullParts, { type: r.full.mimeType || "audio/webm" })); });
  try { if (r.full.state !== "inactive") r.full.stop(); } catch (e) {}
  r.pieces.forEach(p => { try { if (p.r.state !== "inactive") p.r.stop(); } catch (e) {} });
  const [full, ...pieces] = await Promise.all([fullDone, ...r.pieces.map(p => p.done)]);
  r.stream.getTracks().forEach(t => t.stop());
  try { r.ctx.close(); } catch (e) {}
  try { if (r.wake) r.wake.release(); } catch (e) {}
  rec = null;
  const st = r.started;
  recDone = { name: "Ghi âm cuộc họp " + st.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }), full, pieces: pieces.filter(b => b.size > 2000), file: null, dur, saved: false, when: st };
  $("#recClock").textContent = "■ " + recFmt(dur); $("#recLevel").style.width = "0";
  recUI(); recShowResult();
  toast("Đã dừng ghi (" + recFmt(dur) + "). Bấm “📝 Chuyển thành văn bản” khi sếp cần.", "ok");
  if (!$("#dlgRec").open) $("#dlgRec").showModal();
}
function recPickFile(f) {
  if (!f) return;
  recDone = { name: f.name.replace(/\.[^.]+$/, ""), full: f, pieces: null, file: f, dur: 0, saved: true, when: new Date(f.lastModified || Date.now()) };
  $("#recClock").textContent = "00:00"; recShowResult();
  const a = $("#recAudio"); a.onloadedmetadata = () => { if (isFinite(a.duration)) { recDone.dur = a.duration; $("#recName").textContent = recDone.name + " · " + recFmt(a.duration); } };
}
function recDownload() {
  if (!recDone) return;
  const ext = /mp4/.test(recDone.full.type) ? "m4a" : "webm";
  const a = document.createElement("a"); a.href = URL.createObjectURL(recDone.full); a.download = recDone.name.replace(/[\\/:*?"<>|]+/g, "-") + "." + ext;
  document.body.appendChild(a); a.click(); a.remove(); recDone.saved = true;
}
function wavFromBuffer(ab, from, to) {
  // AudioBuffer (đã ở 16 kHz) → WAV 16-bit đơn kênh, đoạn [from, to) theo mẫu
  const n = to - from, chs = ab.numberOfChannels, out = new ArrayBuffer(44 + n * 2), v = new DataView(out), rate = ab.sampleRate;
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  const data = []; for (let c = 0; c < chs; c++) data.push(ab.getChannelData(c));
  for (let i = 0, o = 44; i < n; i++, o += 2) { let x = 0; for (let c = 0; c < chs; c++) x += data[c][from + i]; x /= chs; x = Math.max(-1, Math.min(1, x)); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([out], { type: "audio/wav" });
}
async function decode16k(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC({ sampleRate: 16000 });
  try { return await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { try { ctx.close(); } catch (e) {} }
}
function b64Of(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(blob); }); }
async function getRecModel() {
  if (recModel) return recModel;
  const { mod, ai } = await getAIInst();
  recModel = aiWrap({});
  return recModel;
}
async function recTranscribePiece(wav, startSec, tail, speakers) {
  const prompt = `Đây là một đoạn ghi âm cuộc họp bằng tiếng Việt, bắt đầu tại thời điểm ${recFmt(startSec)} của cuộc họp. Người nói có thể dùng giọng Bắc, Trung, Nam hoặc giọng địa phương, có người nói nhỏ hoặc ở xa micro: hãy nghe kỹ theo ngữ cảnh.
Nhiệm vụ: chép lại NGUYÊN VĂN lời nói thành chữ tiếng Việt, đủ dấu câu, đúng chính tả.
- Mỗi lượt lời một dòng, dạng: [mm:ss] Người N: nội dung. Thời điểm tính từ đầu cuộc họp (cộng thêm ${recFmt(startSec)}).
- Phân biệt người nói theo giọng; giữ nhất quán nhãn người nói với phần trước${speakers.length ? " (đã có: " + speakers.join(", ") + ")" : ""}. Nếu người nói được gọi tên hoặc tự giới thiệu thì dùng tên thật.
- Chỗ nghe không rõ: không đoán, ghi [không rõ].
- Bỏ tiếng ồn, tiếng ậm ừ vô nghĩa. Không tóm tắt, không bình luận, không thêm nội dung.
- Vài giây đầu có thể trùng với cuối phần trước: bỏ phần đã có.
- Nếu không có lời nói, chỉ trả về: (không có lời nói)${tail ? "\n\nCuối phần trước (chỉ để nối mạch, không chép lại):\n" + tail : ""}`;
  const m = await getRecModel();
  const r = await m.generateContent([{ inlineData: { mimeType: "audio/wav", data: await b64Of(wav) } }, { text: prompt }]);
  return (r.response.text() || "").trim();
}
async function recTranscribe() {
  if (!recDone) return;
  const btn = $("#recTrans"), prog = $("#recProg");
  btn.disabled = true;
  try {
    // Chuẩn bị các đoạn: { wav, start }
    prog.textContent = "Đang chuẩn bị âm thanh…";
    const jobs = [];
    if (recDone.pieces && recDone.pieces.length) {
      let start = 0;
      for (const b of recDone.pieces) { const ab = await decode16k(b); jobs.push({ ab, start }); start += Math.max(0, ab.duration - 2); }
    } else {
      const ab = await decode16k(recDone.full);
      const step = REC_PIECE * ab.sampleRate, ov = 2 * ab.sampleRate;
      for (let i = 0; i < ab.length; i += step) jobs.push({ ab, start: i / ab.sampleRate, from: Math.max(0, i - (i ? ov : 0)), to: Math.min(ab.length, i + step) });
    }
    const lines = [];
    for (let k = 0; k < jobs.length; k++) {
      const j = jobs[k];
      prog.textContent = `Đang chuyển thành chữ đoạn ${k + 1}/${jobs.length}… (giữ cửa sổ này mở)`;
      const wav = wavFromBuffer(j.ab, j.from || 0, j.to || j.ab.length);
      const tail = lines.slice(-5).join("\n");
      const speakers = [...new Set(lines.map(l => (l.match(/^\[[\d:]+\]\s*([^:]{1,40}):/) || [])[1]).filter(Boolean))].slice(0, 15);
      let txt = null, err = null;
      for (let t = 0; t < 3 && txt == null; t++) { try { txt = await recTranscribePiece(wav, j.start, tail, speakers); } catch (e) { err = e; await new Promise(r => setTimeout(r, 4000 * (t + 1))); } }
      if (txt == null) lines.push(`[${recFmt(j.start)}] ⚠ Chưa chuyển được đoạn này (${(err && err.message) || "lỗi kết nối"}).`);
      else if (!/^\(không có lời nói\)$/i.test(txt)) lines.push(...txt.split(/\n+/).map(x => x.trim()).filter(Boolean));
    }
    const body = lines.map(l => {
      let h = esc(l);
      h = h.replace(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]{1,40}):/, (a, ts, who) => `<span style="color:#64748b">[${ts}]</span> <b>${who}:</b>`);
      return `<p>${h}</p>`;
    }).join("") || "<p><i>(Không nhận ra lời nói trong bản ghi.)</i></p>";
    const when = recDone.when.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
    const html = `<h2 style="margin-top:0">${esc(recDone.name)}</h2><p><i>Thời điểm: ${when}${recDone.dur ? " · Thời lượng: " + recFmt(recDone.dur) : ""} · Chép lời bằng Gemini — cần nghe lại để đối chiếu những chỗ quan trọng.</i></p>${body}`;
    recDone.saved = true;
    prog.textContent = "Xong. Đã tạo ghi chú mới.";
    $("#dlgRec").close();
    await createNoteDocument(catRootId("bst-ghi-chu"), recDone.name, "blank", html);
  } catch (e) {
    prog.textContent = "Chưa chuyển được: " + (e.message || e);
  } finally { btn.disabled = false; }
}
window.addEventListener("beforeunload", e => { if (rec || (dict && dict.meeting) || (recDone && !recDone.saved)) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- Mô hình Gemini dùng cho tóm tắt ---------- */
let sumModel = null;
async function getSumModel() {
  if (sumModel) return sumModel;
  const { mod, ai } = await getAIInst();
  sumModel = aiWrap({});
  return sumModel;
}
function mdLite(md) {
  const out = []; let ul = false;
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  String(md || "").split(/\n/).forEach(raw => {
    const l = raw.trim();
    if (/^[-*•]\s+/.test(l)) { if (!ul) { out.push("<ul>"); ul = true; } out.push("<li>" + inline(l.replace(/^[-*•]\s+/, "")) + "</li>"); return; }
    if (ul) { out.push("</ul>"); ul = false; }
    if (!l) return;
    if (/^#{1,6}\s+/.test(l)) out.push("<h4>" + inline(l.replace(/^#{1,6}\s+/, "")) + "</h4>");
    else out.push("<p>" + inline(l) + "</p>");
  });
  if (ul) out.push("</ul>");
  return out.join("");
}

/* ---------- Tóm tắt phần bôi đen bằng Gemini ---------- */
// Bôi đen đoạn cần tóm tắt → bấm "✨ Tóm tắt" → các ý chính được chèn ngay dưới đoạn đó.
async function summarizeNote(btn) {
  const sheet = $("#inFileSheet"); if (!sheet) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed || !sheet.contains(sel.getRangeAt(0).commonAncestorContainer)) { toast("Sếp bôi đen đoạn cần tóm tắt trong văn bản rồi bấm “✨ Tóm tắt”.", "err"); return; }
  const src = sel.toString().trim();
  if (src.split(/\s+/).length < 15) { toast("Đoạn bôi đen còn quá ngắn để tóm tắt.", "err"); return; }
  const range = sel.getRangeAt(0).cloneRange();
  // Điểm chèn: sau khối (đoạn văn) chứa cuối phần bôi đen
  let endNode = range.endContainer; if (endNode.nodeType === 3) endNode = endNode.parentNode;
  let block = endNode.closest && endNode.closest("p,div,li,h1,h2,h3,h4,blockquote,table,ul,ol");
  while (block && block !== sheet && block.parentNode !== sheet) block = block.parentNode;
  const old = btn.textContent; btn.disabled = true; btn.textContent = "⏳ Đang tóm tắt…";
  try {
    const prompt = `Tóm tắt nội dung chính của đoạn văn tiếng Việt dưới đây, trung thành với nội dung gốc: không thêm thông tin, không suy diễn, không bình luận; giữ nguyên tên riêng, số hiệu văn bản, số liệu. Trình bày thành các ý ngắn, mỗi ý một dòng bắt đầu bằng "- ".

ĐOẠN VĂN:
${src.slice(0, 120000)}`;
    const r = await (await getSumModel()).generateContent(prompt);
    const html = mdLite(r.response.text());
    if (!html) throw new Error("Gemini không trả về nội dung");
    const box = document.createElement("div");
    box.className = "note-summary";
    box.innerHTML = `<p><b>✨ Tóm tắt nội dung chính:</b></p>${html}`;
    if (block && block !== sheet) block.after(box); else { range.collapse(false); range.insertNode(box); }
    sheet.dispatchEvent(new Event("input"));
    toast("Đã chèn bản tóm tắt ngay dưới đoạn đã chọn.", "ok");
  } catch (e) { toast("Chưa tóm tắt được: " + (e.message || e), "err"); }
  finally { btn.disabled = false; btn.textContent = old; }
}

/* ---------- Sự kiện ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-cat],[data-folder],[data-home],[data-back],[data-go],[data-login],[data-adminlogin],[data-edit],[data-move],[data-del],[data-movefolder],[data-upload],[data-fnew],[data-fren],[data-fdel],[data-fimg],[data-flevel],[data-fdesc],[data-star],[data-doc],[data-view],[data-freset],[data-close],[data-image-close],[data-newnote],[data-togglenote],[data-quicknote],[data-docmode],[data-notesave],[data-edcmd],[data-edins],[data-transferdoc],[data-transferfolder],[data-copyfolder],[data-exportdoc],[data-exporttxt],[data-printnote],[data-dictate],[data-notesum]");
  if (!t) return;
  if (t.hasAttribute("data-notesum")) { e.preventDefault(); summarizeNote(t); return; }
  if (t.dataset.cat) { e.preventDefault(); go("dm/" + t.dataset.cat); }
  else if (t.dataset.folder) { e.preventDefault(); go("f/" + encodeURIComponent(t.dataset.folder)); }
  else if (t.hasAttribute("data-home")) { e.preventDefault(); go(""); }
  else if (t.hasAttribute("data-back")) { e.preventDefault(); history.length > 1 ? history.back() : go(""); }
  else if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); }
  else if (t.hasAttribute("data-login")) { if (t.closest("#dlgDoc")) $("#dlgDoc").close(); openLogin(); }
  else if (t.hasAttribute("data-adminlogin")) openLogin("Đăng nhập bằng tài khoản quản trị.");
  else if (t.dataset.edit) { if (t.closest("#dlgDoc")) $("#dlgDoc").close(); openEdit(t.dataset.edit); }
  else if (t.dataset.move) { if (t.closest("#dlgDoc")) $("#dlgDoc").close(); moveTo(t.dataset.move, false); }
  else if (t.dataset.del) { e.preventDefault(); deleteDocItem(t.dataset.del); }
  else if (t.hasAttribute("data-newnote")) {
    e.preventDefault();
    const h = decodeURIComponent(location.hash.slice(1)), cur = currentCatKey();
    const folderId = h.startsWith("f/") && tree[h.slice(2)] ? h.slice(2) : (cur && catRootId(cur) ? catRootId(cur) : catRootId("bst-ghi-chu"));
    if (cur !== "bst-ghi-chu" && !h.startsWith("f/")) {
      go("dm/bst-ghi-chu");
      setTimeout(() => { const inp = $("#quickNoteName"); if (inp) inp.focus(); }, 100);
    } else {
      const box = $("#noteCreateBox");
      if (box && box.hidden) { box.hidden = false; const inp = $("#quickNoteName"); if (inp) inp.focus(); }
      else createNoteDocument(folderId);
    }
  }
  else if (t.dataset.togglenote) {
    e.preventDefault();
    const box = $("#noteCreateBox");
    if (box) { box.hidden = !box.hidden; if (!box.hidden && $("#quickNoteName")) $("#quickNoteName").focus(); }
    else createNoteDocument(t.dataset.togglenote);
  }
  else if (t.dataset.quicknote) { e.preventDefault(); createNoteDocument(t.dataset.quicknote); }
  else if (t.dataset.docmode) {
    e.preventDefault();
    if (currentOpenDocId) {
      if (currentDocMode === "edit" && t.dataset.docmode === "view") saveInFileNote(currentOpenDocId, true);
      openDoc(currentOpenDocId, t.dataset.docmode);
    }
  }
  else if (t.dataset.notesave) { e.preventDefault(); saveInFileNote(t.dataset.notesave, false); }
  else if (t.hasAttribute("data-dictate")) { e.preventDefault(); toggleDictation(); }
  else if (t.dataset.edcmd) {
    e.preventDefault();
    const sheet = $("#inFileSheet");
    if (sheet) { sheet.focus(); document.execCommand(t.dataset.edcmd, false, null); }
  }
  else if (t.dataset.edins) {
    e.preventDefault();
    const sheet = $("#inFileSheet");
    if (sheet) {
      sheet.focus();
      const k = t.dataset.edins;
      if (k === "table") document.execCommand("insertHTML", false, `<table><thead><tr><th>STT</th><th>Nội dung</th><th>Ghi chú</th></tr></thead><tbody><tr><td>1</td><td>…</td><td>…</td></tr><tr><td>2</td><td>…</td><td>…</td></tr></tbody></table><p></p>`);
      else if (k === "check") document.execCommand("insertHTML", false, `<p>☐ Nội dung cần kiểm tra / thực hiện…</p>`);
      else if (k === "date") document.execCommand("insertHTML", false, `<span><i>(Ngày ${fmtDate(todayISO())})</i> </span>`);
    }
  }
  else if (t.dataset.transferdoc) { e.preventDefault(); transferNoteToSpecificDoc(t.dataset.transferdoc); }
  else if (t.dataset.transferfolder) { e.preventDefault(); transferNoteToSpecificFolder(t.dataset.transferfolder, false); }
  else if (t.dataset.copyfolder) { e.preventDefault(); transferNoteToSpecificFolder(t.dataset.copyfolder, true); }
  else if (t.dataset.exportdoc) { e.preventDefault(); exportNoteFile(t.dataset.exportdoc, "doc"); }
  else if (t.dataset.exporttxt) { e.preventDefault(); exportNoteFile(t.dataset.exporttxt, "txt"); }
  else if (t.dataset.printnote) { e.preventDefault(); exportNoteFile(t.dataset.printnote, "print"); }
  else if (t.dataset.doc) { e.preventDefault(); openDoc(t.dataset.doc); }
  else if (t.dataset.view) { view = t.dataset.view; try { localStorage.setItem("pnd_view", view); } catch (x) {} route(); }
  else if (t.hasAttribute("data-freset")) { filt = { year: "", fmt: "", status: "", sort: "" }; route(); }
  else if (t.dataset.movefolder) moveTo(t.dataset.movefolder, true);
  else if (t.dataset.upload) openUpload(t.dataset.upload);
  else if (t.dataset.fnew) newFolder(t.dataset.fnew);
  else if (t.dataset.fren) renameFolder(t.dataset.fren);
  else if (t.dataset.fdel) deleteFolder(t.dataset.fdel);
  else if (t.dataset.fimg) setFolderImage(t.dataset.fimg);
  else if (t.dataset.flevel) setFolderLevel(t.dataset.flevel);
  else if (t.dataset.fdesc) setFolderDesc(t.dataset.fdesc);
  else if (t.dataset.star) { const f = items[t.dataset.star]; if (f) openDoc(f.id); else { const s = thongDung.find(x => x.id === t.dataset.star); if (s && !canCat(s.cat)) openLogin("Nhập mã tài khoản có quyền xem danh mục “" + (CAT[s.cat] ? CAT[s.cat].name : "") + "”."); else if (s) go("f/" + encodeURIComponent(s.parent)); } }
  else if (t.hasAttribute("data-close") || t.hasAttribute("data-image-close")) t.closest("dialog").close();
});
document.addEventListener("change", e => {
  const b = e.target.closest && e.target.closest("[data-edblock],[data-edsize]");
  if (!b) return;
  const sheet = $("#inFileSheet");
  if (!sheet) return;
  sheet.focus();
  if (b.hasAttribute("data-edblock")) document.execCommand("formatBlock", false, b.value);
  else if (b.hasAttribute("data-edsize")) document.execCommand("fontSize", false, b.value);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target && e.target.id === "quickNoteName") {
    e.preventDefault();
    const btn = document.querySelector("[data-quicknote]");
    if (btn) createNoteDocument(btn.dataset.quicknote);
  }
});
document.querySelectorAll("#dlgLogin .tab").forEach(b => b.onclick = () => setLoginTab(b.dataset.tab));
$("#btnLogin").onclick = () => openLogin();
$("#btnLogout").onclick = async () => { if (!await ask("Thoát khỏi Phúc Nguyên Digital trên máy này?")) return; saveSession(null); saveTok(null); acct = null; aiChat = null; $("#aiLog").innerHTML = ""; if (auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth); else { isAdmin = false; await afterAuth(); } toast("Đã thoát."); };
$("#btnPw").onclick = async () => {
  const pw = await ask("Đặt mật khẩu mới cho tài khoản đang đăng nhập (ít nhất 6 ký tự).", { title: "ĐỔI MẬT KHẨU", input: "Mật khẩu mới", ok: "Đổi mật khẩu" });
  if (!pw) return;
  try { await updatePassword(auth.currentUser, pw); toast("Đã đổi mật khẩu.", "ok"); }
  catch (x) { toast(x.code === "auth/requires-recent-login" ? "Cần đăng nhập lại rồi đổi mật khẩu ngay." : x.code === "auth/weak-password" ? "Mật khẩu cần ít nhất 6 ký tự." : "Chưa đổi được: " + x.message, "err"); }
};
async function googleLogin() {
  const prov = new GoogleAuthProvider();
  prov.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, prov);
}
const loginErrText = x => /auth\/(invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login-credentials)/.test(x.code || "") ? "Tên đăng nhập hoặc mật khẩu chưa đúng." : x.code === "auth/user-disabled" ? "Tài khoản đã bị khóa." : x.code === "auth/too-many-requests" ? "Đăng nhập sai nhiều lần; hãy thử lại sau ít phút." : x.code === "auth/popup-blocked" ? "Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên rồi thử lại." : x.code === "auth/popup-closed-by-user" ? "Cửa sổ đăng nhập đã bị đóng." : (x.message || "Chưa đăng nhập được.");
$("#btnGoogle").onclick = async () => {
  $("#loginErr").textContent = "Đang mở cửa sổ đăng nhập Google…";
  try { await googleLogin(); $("#dlgLogin").close(); $("#loginErr").textContent = ""; toast("Đã đăng nhập.", "ok"); }
  catch (x) { $("#loginErr").textContent = loginErrText(x); }
};
$("#loginForm").onsubmit = async e => {
  e.preventDefault(); const btn = $("#loginGo"); btn.disabled = true; $("#loginErr").textContent = loginTab === "acct" ? "Đang đăng nhập…" : "Đang kiểm tra mã…";
  try {
    if (loginTab === "acct") {
      const em = $("#admEmail").value.trim(), pw = $("#admPass").value;
      if (!em || !pw) throw new Error("Nhập tên đăng nhập và mật khẩu, hoặc bấm “Đăng nhập bằng Google”.");
      await signInWithEmailAndPassword(auth, toEmail(em), pw);   // quyền được nạp trong afterAuth
    }
    else { await useCode($("#codeInput").value); await loadItems(); }
    $("#dlgLogin").close(); $("#loginErr").textContent = ""; $("#admPass").value = "";
    toast(loginTab === "acct" ? "Đã đăng nhập." : "Đã xác nhận mã truy cập.", "ok");
    route();
  } catch (x) { $("#loginErr").textContent = loginErrText(x); }
  finally { btn.disabled = false; }
};
$("#searchForm").onsubmit = e => { e.preventDefault(); const q = $("#searchInput").value.trim(); if (q) go("tim/" + encodeURIComponent(q)); };
$("#btnUpload").onclick = () => openUpload();
// Kéo thả tệp vào khung thư mục đang mở → mở hộp tải lên với đúng thư mục
document.addEventListener("dragstart", e => { const row = e.target.closest && e.target.closest("[data-sort-id]"); if (!canUp() || !row) return; dragItem = row.dataset; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.dataset.sortId); row.classList.add("is-dragging"); });
document.addEventListener("dragend", e => { const row = e.target.closest && e.target.closest("[data-sort-id]"); if (row) row.classList.remove("is-dragging"); clearDropMarks(); dragItem = null; });
document.addEventListener("dragover", e => {
  const dt = dropTarget(e);
  if (dt) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!dt.el.classList.contains("drop-into")) { clearDropMarks(); dt.el.classList.add("drop-into"); } return; }
  document.querySelectorAll(".drop-into").forEach(x => x.classList.remove("drop-into"));
  const row = e.target.closest && e.target.closest("[data-sort-id]");
  if (canUp() && dragItem && row && row.dataset.sortKind === dragItem.sortKind && row.dataset.sortParent === dragItem.sortParent) {
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    const after = dropAfter(row, e);
    document.querySelectorAll(".sort-before,.sort-after").forEach(x => { if (x !== row) x.classList.remove("sort-before", "sort-after"); });
    row.classList.toggle("sort-after", after); row.classList.toggle("sort-before", !after);
  } const z = e.target.closest && e.target.closest(".dropzone"); if (z && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); z.classList.add("drag"); } });
document.addEventListener("dragleave", e => { const z = e.target.closest && e.target.closest(".dropzone"); if (z && !z.contains(e.relatedTarget)) z.classList.remove("drag"); });
document.addEventListener("drop", async e => {
  const dt = dropTarget(e);
  if (dt) { e.preventDefault(); const it = dragItem; clearDropMarks(); dragItem = null; await doMove(it.sortId, it.sortKind === "folder", dt.fid); return; }
  const row = e.target.closest && e.target.closest("[data-sort-id]");
  if (canUp() && dragItem && row && row.dataset.sortKind === dragItem.sortKind && row.dataset.sortParent === dragItem.sortParent) {
    e.preventDefault();
    const kind = dragItem.sortKind, parent = dragItem.sortParent, movingId = dragItem.sortId, targetId = row.dataset.sortId, after = dropAfter(row, e);
    clearDropMarks();
    if (movingId !== targetId) {
      // Thứ tự đang hiển thị trên trang (đã gồm thứ tự lưu trước đó), rồi chèn vào trước/sau thẻ được thả
      const shown = [...document.querySelectorAll(`[data-sort-kind="${kind}"][data-sort-parent="${CSS.escape(parent)}"]`)].map(x => x.dataset.sortId);
      const all = (kind === "folder" ? orderedKids(parent) : sortFiles(filesOf(parent))).map(x => x.id);
      const ids = [...new Set([...shown, ...all])].filter(id => id !== movingId);
      const at = ids.indexOf(targetId);
      ids.splice(at < 0 ? ids.length : at + (after ? 1 : 0), 0, movingId);
      try { await saveOrder(kind, parent, ids); toast("Đã cập nhật thứ tự.", "ok"); route(); } catch (x) { toast("Không lưu được thứ tự: " + x.message, "err"); }
    }
    dragItem = null; return;
  }
  const z = e.target.closest && e.target.closest(".dropzone"); if (!z || !e.dataTransfer.files.length || $("#dlgUpload").open) return; e.preventDefault(); z.classList.remove("drag"); openUpload(z.dataset.dropfolder, e.dataTransfer.files); });
$("#btnAI").onclick = openAI;
$("#btnRec").onclick = () => { if (dict && dict.meeting) toast("Đang ghi cuộc họp. Bấm “⏹ Dừng ghi cuộc họp” trong ghi chú để kết thúc.", "ok"); else openRec(); };
$("#recStart").onclick = mtgStart;
$("#recPause").onclick = recPause;
$("#recStop").onclick = recStop;
$("#recSave").onclick = recDownload;
$("#recTrans").onclick = recTranscribe;
$("#recFile").onchange = e => { recPickFile(e.target.files && e.target.files[0]); e.target.value = ""; };
$("#btnScan").onclick = () => scanDrive(false);
$("#btnInit").onclick = initTree;
$("#btnShare").onclick = shareAll;
$("#btnSource").onclick = addSource;
$("#upFolder").onchange = upFolderChanged;
$("#upAccess").onclick = e => { const b = e.target.closest("[data-lv]"); if (b) setUpLevel(b.dataset.lv, true); };
$("#upFiles").onchange = () => { addUpFiles($("#upFiles").files); $("#upFiles").value = ""; };
$("#upList").onclick = e => { const b = e.target.closest("[data-rmfile]"); if (!b) return; e.preventDefault(); upFilesSel.splice(+b.dataset.rmfile, 1); if (!upFilesSel.length) { $("#upName").value = ""; $("#upAuto").textContent = ""; } renderUpList(); };
$("#upLinks").oninput = renderUpList;
$("#upName").onchange = () => applyAuto($("#upName").value);
const dropEl = $("#drop");
dropEl.ondragover = e => { e.preventDefault(); dropEl.classList.add("drag"); };
dropEl.ondragleave = () => dropEl.classList.remove("drag");
dropEl.ondrop = e => { e.preventDefault(); dropEl.classList.remove("drag"); const txt = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"); if (e.dataTransfer.files.length) addUpFiles(e.dataTransfer.files); else if (txt && isWebUrl(txt.trim().split(/\s+/)[0])) { $("#upLinks").value = ($("#upLinks").value ? $("#upLinks").value + "\n" : "") + txt.trim(); renderUpList(); } };
$("#upForm").onsubmit = submitUpload;
$("#edForm").onsubmit = submitEdit;
$("#aiForm").onsubmit = askAI;
$("#aiInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#aiForm").requestSubmit(); } });
window.addEventListener("hashchange", route);
document.addEventListener("change", e => { const s = e.target.closest && e.target.closest("[data-filt]"); if (s) { filt[s.dataset.filt] = s.value; route(); } });

/* ---------- Khởi động ---------- */
async function afterAuth() {
  acct = null;
  if (user && !user.isAnonymous && user.email) {
    try { const a = await getDoc(doc(db, "pnd_accounts", user.email.toLowerCase())); if (a.exists()) acct = { id: a.id, ...a.data() }; } catch (e) { console.warn("tài khoản", e.message); }
  }
  isAdmin = isAdminUser(user) || !!(acct && grantOk(acct) && acct.role === "quan-tri");
  if (user && !user.isAnonymous && !isAdmin) {
    if (!acct) toast("Tài khoản " + showName(user.email) + " chưa được cấp quyền trong thư viện; đang xem như khách.", "err");
    else if (!grantOk(acct)) toast("Tài khoản đã bị khóa hoặc hết hạn sử dụng.", "err");
  }
  if (!isAdmin && session && user) {
    // Bảo đảm phiên hiện tại đã ghi mã và lấy lại quyền mới nhất của mã
    try {
      const u = await getDoc(doc(db, "pnd_users", user.uid)); if (!u.exists() || u.data().code !== session.code) await useCode(session.code);
      const m = await getDoc(doc(db, "pnd_ma", session.code));
      if (m.exists()) { const x = m.data(); saveSession({ ...session, han: x.han, role: x.role || "chuyen-muc", cats: Array.isArray(x.cats) && x.cats.length ? x.cats : ["*"] }); }
    }
    catch (e) { if (e.invalidCode) { saveSession(null); toast(e.message + " Hãy nhập mã mới.", "err"); } }
  }
  await loadItems();
  if (isAdmin) await migrateAccess();
  // Quyền Drive lưu từ trước có thể thuộc tài khoản Google khác (không sửa được thư mục PND): kiểm tra, sai thì bỏ
  if (canUp() && driveTok) { try { if (!await checkDriveTok(driveTok)) { saveTok(null); driveWho = null; } } catch (e) {} }
  // Người quản lý: hiện ngay bản đã lưu trên máy, rồi đọc lại Drive
  const who = canUp() ? (isAdmin ? "admin" : "up:" + (user && user.uid)) : null;
  if (who) {
    try { const c = JSON.parse(localStorage.getItem("pnd_live2") || "null"); if (c && c.who === who && Date.now() - c.t < 6 * 3600e3) { Object.assign(tree, c.tree); for (const [id, it] of Object.entries(c.items)) items[id] = { ...it, ...(items[id] || {}) }; } } catch (e) {}
    if (await loadLive()) { try { localStorage.setItem("pnd_live2", JSON.stringify({ t: Date.now(), who, tree, items })); } catch (e) {} }
  }
  authReady = true;
  const dl = $("#dlgLogin"); if (dl.open && myGrant()) dl.close();
  route();
}
/* Tài liệu cũ chưa có mức truy cập: gán theo thư mục (mặc định Nội bộ — giữ đúng như trước) */
async function migrateAccess() {
  const miss = Object.values(items).filter(f => !f.access);
  if (!miss.length) return;
  try {
    await commitOps(miss.map(f => ({ type: "merge", ref: doc(db, "pnd_items", f.id), data: { access: folderLevel(f.parent) } })));
    miss.forEach(f => f.access = folderLevel(f.parent));
    console.info("Đã gán mức truy cập cho " + miss.length + " tài liệu.");
  } catch (e) { console.warn("gán mức truy cập", e.message); }
}
route();
onAuthStateChanged(auth, async u => {
  user = u;
  if (!u && session) { try { await signInAnonymously(auth); return; } catch (e) {} }
  if (!loaded.tree) { await loadSettings(); await loadTree(); }
  await afterAuth();
});
