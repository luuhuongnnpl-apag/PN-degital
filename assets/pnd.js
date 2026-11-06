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
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
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
const CATS = [
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
const CAT = Object.fromEntries(CATS.map(c => [c.key, c]));
const PUBLIC_CATS = CATS.filter(c => !c.adminOnly);

/* ---------- Trạng thái ---------- */
let settings = null;        // {rootId, cats:{key:folderId}}
let tree = {};              // folderId -> {id,name,parent,cat,depth}
let items = {};             // fileId -> item
let thongDung = [];         // [{id,name,cat,parent}]
let user = null, isAdmin = false;
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
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Hộp xác nhận / nhập liệu ngay trong trang (trình duyệt nhúng có thể chặn confirm/prompt) */
function ask(msg, opt = {}) {
  return new Promise(res => {
    const d = $("#dlgConfirm");
    $("#cfTitle").textContent = opt.title || "XÁC NHẬN";
    $("#cfMsg").textContent = msg;
    $("#cfInputWrap").hidden = !opt.input; $("#cfInput").value = opt.value || ""; $("#cfInputLbl").textContent = opt.input || "";
    const sel = $("#cfSelect"); sel.hidden = !opt.options; if (opt.options) sel.innerHTML = opt.options;
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

/* ---------- Quyền xem ---------- */
function canCat(key) {
  if (isAdmin) return true;
  if (CAT[key] && CAT[key].adminOnly) return false;
  if (!session) return false;
  return session.cats.includes("*") || session.cats.includes(key);
}
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

/* ---------- Tải dữ liệu ---------- */
async function loadSettings() {
  try { const s = await getDoc(doc(db, "pnd_settings", "root")); settings = s.exists() ? s.data() : null; } catch (e) { settings = null; }
  try { const s = await getDoc(doc(db, "pnd_settings", "thongdung")); thongDung = s.exists() ? (s.data().items || []) : []; } catch (e) { thongDung = []; }
}
async function loadTree() {
  try { const snap = await getDocs(collection(db, "pnd_tree")); tree = {}; snap.forEach(d => tree[d.id] = d.data()); } catch (e) { console.warn("tree", e); }
  loaded.tree = true;
}
async function loadItems() {
  items = {};
  try {
    if (isAdmin) { (await getDocs(collection(db, "pnd_items"))).forEach(d => items[d.id] = d.data()); }
    else if (session) {
      const keys = session.cats.includes("*") ? PUBLIC_CATS.map(c => c.key) : session.cats.filter(k => CAT[k]);
      for (const k of keys) (await getDocs(query(collection(db, "pnd_items"), where("cat", "==", k)))).forEach(d => items[d.id] = d.data());
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
  loaded.items = true;
}

/* ---------- Cây thư mục ---------- */
const catRootId = key => settings && settings.cats ? settings.cats[key] : null;
const childrenOf = id => Object.values(tree).filter(n => n.parent === id);
const filesOf = id => Object.values(items).filter(f => f.parent === id);
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
function countFiles(id) { let n = filesOf(id).length; for (const c of childrenOf(id)) n += countFiles(c.id); return n; }

/* ---------- Giao diện chung ---------- */
function renderNav() {
  const cur = currentCatKey();
  $("#catNav").innerHTML = visibleCats().map(c => `<button type="button" class="pill${cur === c.key ? " on" : ""}" data-cat="${c.key}">${c.label.length > 1 ? esc(c.label[0]) + '<span class="hl">' + esc(c.label[1]) + "</span>" : esc(c.label[0])}</button>`).join("");
}
function renderAuth() {
  document.body.classList.toggle("is-admin", isAdmin);
  $("#whoami").textContent = isAdmin ? "Quản trị: " + user.email : session ? "Mã: " + session.code + " (đến " + fmtDate(session.han) + ")" : "";
  $("#btnLogout").hidden = !isAdmin && !session;
  $("#btnLogin").hidden = isAdmin;
  if (!$("#btnScan").disabled) $("#adminNote").textContent = isAdmin ? (settings ? (driveTok ? "Đã kết nối Drive" + (settings.lastScan ? " · quét lần cuối " + new Date(settings.lastScan).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "") + "." : "Drive sẽ tự kết nối lại khi bấm Quét hoặc Tải lên.") : "Chưa có cây thư mục: bấm Khởi tạo.") : "";
  $("#btnInit").hidden = !!settings;
}
function currentCatKey() {
  const h = location.hash.slice(1);
  if (h.startsWith("dm/")) return h.slice(3);
  if (h.startsWith("f/")) { const n = tree[decodeURIComponent(h.slice(2))]; return n ? n.cat : null; }
  return null;
}
function navRow() { return `<div class="nav-row"><button type="button" class="pill" data-back>QUAY LẠI</button><button type="button" class="pill" data-home>TRANG CHỦ</button></div>`; }

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const home = !h;
  $("#layout").classList.toggle("no-tools", !home);
  renderNav(); renderAuth();
  if (home) return renderHome();
  if (h.startsWith("dm/")) return renderCat(h.slice(3));
  if (h.startsWith("f/")) return renderFolder(h.slice(2));
  if (h.startsWith("tim/")) return renderSearch(h.slice(4));
  if (h === "tai-khoan") return renderAccounts();
  location.hash = "";
}
const go = h => { if (location.hash.slice(1) === h) route(); else location.hash = h; };

/* ---------- Trang chủ ---------- */
function renderHome() {
  const stars = thongDung.filter(s => isAdmin || !CAT[s.cat] || !CAT[s.cat].adminOnly);
  const starHTML = stars.length
    ? `<div class="star-list">${stars.map(s => `<button type="button" class="star-item" data-star="${esc(s.id)}"><span class="st">★</span><span>${esc(s.name)}<small>${esc(CAT[s.cat] ? CAT[s.cat].name : "")}</small></span></button>`).join("")}</div>`
    : `<p class="empty">Tài liệu được đánh dấu ★ sẽ hiện ở đây.${isAdmin ? " (Đánh dấu khi tải lên hoặc bấm Sửa ở bảng tài liệu.)" : ""}</p>`;
  const L = CFG.LINKS || {};
  const tile = (href, icon, colors, label, ext) => `<a class="ltile" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}><span class="lv">${cover(icon, colors)}</span><span>${esc(label)}</span></a>`;
  $("#main").innerHTML = `
    <section class="box grow"><h2 class="box-title sm">THÔNG DỤNG</h2>${starHTML}</section>
    <section class="box">
      <h4 class="links-title">LIÊN KẾT</h4>
      <div class="links">
        ${tile(L.pnl, "lib", ["#173f66", "#3c6ea3"], "PN Library", true)}
        ${tile(L.pnw, "cal", ["#1f527d", "#5c8fbf"], "PN Work", true)}
        ${tile(L.drive, "cloud", ["#2f6f4f", "#58a37a"], "Google Drive", true)}
        ${tile(L.gmail, "mail", ["#8e2c3f", "#c4566a"], "Gmail", true)}
        <button type="button" class="ltile" data-go="tai-khoan"><span class="lv">${cover("key", ["#0f2945", "#2b5f8f"])}</span><span>Quản lý mã tài khoản</span></button>
      </div>
    </section>`;
}

/* ---------- Trang danh mục & thư mục ---------- */
function requireAccess(key) {
  if (canCat(key)) return true;
  $("#main").innerHTML = `<section class="box"><h2 class="box-title">${esc(CAT[key] ? CAT[key].title : "")}</h2>
    <p class="empty">Nội dung này cần mã tài khoản có quyền truy cập danh mục <b>${esc(CAT[key] ? CAT[key].name : key)}</b>.</p>
    <div style="text-align:center"><button type="button" class="pill" style="width:auto;display:inline-block;padding:10px 24px" data-login>NHẬP MÃ TÀI KHOẢN</button></div>${navRow()}</section>`;
  if (authReady) openLogin("Nhập mã tài khoản có quyền xem danh mục “" + (CAT[key] ? CAT[key].name : key) + "”.");
  return false;
}
function folderTools(id) {
  return isAdmin && tree[id] && tree[id].depth >= 2 ? `<span class="ftools"><button type="button" title="Thêm/đổi ảnh bìa" data-fimg="${esc(id)}">▧</button><button type="button" title="Đổi tên" data-fren="${esc(id)}">✎</button><button type="button" title="Xóa thư mục" data-fdel="${esc(id)}">🗑</button></span>` : "";
}
function cardHTML(n, cat) {
  const cnt = loaded.items && canCat(cat.key) ? countFiles(n.id) : null;
  const y = yearOf(n.name);
  const real = tree[n.id] && tree[n.id].name === n.name;
  return `<div class="card-wrap" draggable="${isAdmin ? "true" : "false"}" data-sort-kind="folder" data-sort-id="${esc(n.id)}" data-sort-parent="${esc(n.parent || "")}"><button type="button" class="card" data-folder="${esc(n.id)}"><span class="cv">${n.imageUrl ? `<img src="${esc(n.imageUrl)}" alt="Ảnh ${esc(n.name)}" loading="lazy" referrerpolicy="no-referrer">` : cover(cat.icon, cat.color, y ? String(y) : "")}</span><span class="nm">${esc(n.name)}${cnt != null ? `<span class="ct"><br>${cnt} tài liệu</span>` : ""}</span></button>${real ? folderTools(n.id) : ""}</div>`;
}
const upBtn = parent => isAdmin ? `<button type="button" class="add-folder up" data-upload="${esc(parent)}">⤒ Tải tài liệu lên</button>` : "";
const addBtn = (parent, label) => isAdmin ? `<button type="button" class="add-folder" data-fnew="${esc(parent)}">＋ ${esc(label)}</button>` : "";
function renderCat(key) {
  const cat = CAT[key]; if (!cat || (cat.adminOnly && !isAdmin)) { go(""); return; }
  if (!requireAccess(key)) return;
  const rootId = catRootId(key);
  if (!rootId) { $("#main").innerHTML = `<section class="box"><h2 class="box-title">${esc(cat.title)}</h2><p class="empty">Danh mục đang được chuẩn bị.${isAdmin ? " Bấm “Khởi tạo cây thư mục” ở trang chủ." : ""}</p>${navRow()}</section>`; return; }
  renderFolder(rootId, true);
}
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
      return `<div class="grp-head"><div class="grp-title">${esc(g.name)}</div>${folderTools(g.id)}</div>${cards || isAdmin ? `<div class="cards">${cards}${addBtn(g.id, "Thư mục mới")}</div>` : `<p class="muted">Chưa có tài liệu.</p>`}`;
    }).join("") + (isAdmin ? `<div style="margin-top:14px">${addBtn(id, "Nhóm mới")}</div>` : "");
  } else if (kids.length || isAdmin) {
    body = `<div class="cards">${kids.map(n => cardHTML(n, cat)).join("")}${addBtn(id, "Thư mục mới")}${node.depth >= 2 ? upBtn(id) : ""}</div>`;
  }
  const files = sortFiles(filesOf(id));
  if (files.length) body += (body ? `<div class="grp-title" style="margin-top:20px">Danh sách tài liệu</div>` : "") + tableHTML(files, false);
  if (!body) body = `<p class="empty">${loaded.items ? "Chưa có tài liệu trong mục này." : "Đang tải danh mục…"}</p>`;
  const crumbs = path.length > 1 ? `<div class="crumbs">${path.map((p, i) => i === path.length - 1 ? esc(p.name) : `<a data-folder="${esc(p.id)}">${esc(i === 0 ? cat.name : p.name)}</a>`).join(" › ")}</div>` : "";
  const tools = isAdmin && node.depth >= 2 ? `<div class="page-tools"><button type="button" class="hl" data-upload="${esc(id)}">⤒ Tải tài liệu lên đây</button><button type="button" data-fren="${esc(id)}">✎ Đổi tên thư mục</button><button type="button" data-movefolder="${esc(id)}">⇄ Chuyển sang danh mục khác</button><button type="button" data-fdel="${esc(id)}">🗑 Xóa thư mục</button></div>` : "";
  $("#main").innerHTML = `<section class="box${isAdmin ? " dropzone" : ""}" data-dropfolder="${esc(id)}"><h2 class="box-title">${esc(title)}</h2>${crumbs}${tools}${body}${isAdmin ? '<p class="drop-hint">Mẹo: kéo thả tệp từ máy tính vào khung này để tải lên thẳng thư mục đang mở.</p>' : ""}${navRow()}</section>`;
}
let imageTargetFolder = null;
function setFolderImage(id) {
  if (!isAdmin || !tree[id]) return;
  imageTargetFolder = id;
  const d = $("#dlgImage"), preview = $("#imagePreview");
  const current = tree[id].imageUrl || "";
  preview.innerHTML = current ? `<img src="${esc(current)}" alt="Ảnh bìa hiện tại">` : "Chưa có ảnh bìa";
  $("#imagePasteStatus").textContent = "Bấm vào vùng bên dưới rồi nhấn Ctrl+V để dán ảnh đã sao chép.";
  d.showModal();
  $("#imagePasteArea").focus();
}
async function savePastedFolderImage(file) {
  const id = imageTargetFolder;
  if (!isAdmin || !id || !tree[id]) return;
  if (!file || !file.type.startsWith("image/")) { toast("Clipboard chưa có dữ liệu ảnh hợp lệ.", "err"); return; }
  if (file.size > 12 * 1024 * 1024) { toast("Ảnh vượt quá 12 MB. Hãy giảm dung lượng trước khi dán.", "err"); return; }
  const status = $("#imagePasteStatus"), btn = $("#imageSaveBtn");
  btn.disabled = true; status.textContent = "Đang tải ảnh lên Google Drive…";
  try {
    const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const named = new File([file], "Anh-bia-" + id.slice(0, 8) + "." + ext, { type: file.type });
    const uploaded = await uploadFile(named, settings.rootId);
    await drive(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions?sendNotificationEmail=false`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" })
    });
    const url = "https://drive.google.com/thumbnail?id=" + encodeURIComponent(uploaded.id) + "&sz=w1200";
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
function tableHTML(files, withPath) {
  return `<div class="doc-list"><div class="doc-list-head">DANH SÁCH TÀI LIỆU</div>${files.map(f => `<div class="doc-row" draggable="${isAdmin ? "true" : "false"}" data-sort-kind="file" data-sort-id="${esc(f.id)}" data-sort-parent="${esc(f.parent || "")}">
    <div class="doc-main"><a class="${String(f.name || "").trim().split(/\\s+/).filter(Boolean).length > 4 ? "doc-name doc-name-long" : "doc-name doc-name-short"}" title="${esc(f.name)}" href="${esc(f.link || "#")}" ${f.link ? 'target="_blank" rel="noopener"' : 'aria-disabled="true"'}>${f.star ? "★ " : ""}${esc(f.name)}</a>${f.hit ? '<span class="muted">(khớp nội dung)</span>' : ""}${noteHTML(f) ? `<small class="doc-note">${noteHTML(f)}</small>` : ""}${withPath ? `<small class="doc-note"><a data-folder="${esc(f.parent)}">${esc(pathOf(f.parent).map(p => p.name).join(" › "))}</a></small>` : ""}</div>
    <div class="doc-actions">${isAdmin ? `<button type="button" class="doc-edit" data-edit="${esc(f.id)}" title="Sửa thông tin">Sửa</button><button type="button" class="doc-edit" data-move="${esc(f.id)}" title="Chuyển thư mục">Chuyển</button>` : ""}${f.shared === false && f.mime !== "link" && isAdmin ? '<span class="muted">chưa chia sẻ</span>' : ""}</div>
  </div>`).join("")}</div>`;
}

/* ---------- Tìm kiếm ---------- */
const fold = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
async function renderSearch(q) {
  q = q.trim(); $("#searchInput").value = q;
  if (!q) { go(""); return; }
  if (!isAdmin && !session) { $("#main").innerHTML = `<section class="box"><h2 class="box-title">KẾT QUẢ TÌM KIẾM</h2><p class="empty">Cần đăng nhập bằng mã tài khoản để tìm tài liệu.</p>${navRow()}</section>`; openLogin("Nhập mã tài khoản để tìm kiếm tài liệu."); return; }
  const fq = fold(q).split(/\s+/).filter(Boolean);
  const hit = f => { const hay = fold([f.name, f.issuer, f.number, f.status, f.note, pathOf(f.parent).map(p => p.name).join(" ")].join(" ")); return fq.every(w => hay.includes(w)); };
  let res = Object.values(items).filter(f => canCat(f.cat) && hit(f)).map(f => ({ ...f, hit: false }));
  const draw = (extra) => {
    $("#main").innerHTML = `<section class="box"><h2 class="box-title">KẾT QUẢ TÌM KIẾM</h2><div class="crumbs">“${esc(q)}” · ${res.length} tài liệu${extra || ""}</div>${res.length ? tableHTML(sortFiles(res), true) : '<p class="empty">Không tìm thấy tài liệu phù hợp.</p>'}${navRow()}</section>`;
  };
  draw(isAdmin ? (driveTok ? " · đang tìm cả trong nội dung tệp…" : " · đăng nhập lại Google (bấm Quét) để tìm cả trong nội dung tệp") : "");
  if (isAdmin && driveTok) {
    try {
      const ids = new Set(res.map(r => r.id));
      const qq = "fullText contains '" + q.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "' and trashed=false";
      const j = await drive("https://www.googleapis.com/drive/v3/files?pageSize=200&fields=files(id)&q=" + encodeURIComponent(qq));
      (j.files || []).forEach(x => { if (items[x.id] && !ids.has(x.id)) res.push({ ...items[x.id], hit: true }); });
      draw(" (gồm cả khớp trong nội dung tệp)");
    } catch (e) { draw(" · chưa tìm được trong nội dung: " + e.message); }
  }
}

/* ---------- Đăng nhập ---------- */
let loginTab = "code";
function openLogin(hint) {
  $("#loginErr").textContent = ""; if (hint) $("#codeHint").textContent = hint;
  setLoginTab("code"); const d = $("#dlgLogin"); if (!d.open) d.showModal(); setTimeout(() => $("#codeInput").focus(), 50);
}
function setLoginTab(t) { loginTab = t; $("#imagePasteArea").addEventListener("paste", e => {
  const image = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith("image/"));
  if (!image) { $("#imagePasteStatus").textContent = "Clipboard không chứa ảnh. Hãy sao chép ảnh rồi nhấn Ctrl+V."; return; }
  e.preventDefault();
  const file = image.getAsFile();
  if (file) { $("#imagePreview").innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Ảnh vừa dán">`; $("#imagePasteStatus").textContent = "Đã nhận ảnh. Bấm “Lưu ảnh bìa” để tải lên."; $("#imageSaveBtn").onclick = () => savePastedFolderImage(file); }
});
$("#imagePasteArea").addEventListener("click", () => $("#imagePasteArea").focus());
document.querySelectorAll("#dlgLogin .tab").forEach(b => b.classList.toggle("on", b.dataset.tab === t)); document.querySelectorAll("#dlgLogin [data-pane]").forEach(p => p.hidden = p.dataset.pane !== t); $("#loginGo").textContent = t === "admin" ? "Đăng nhập" : "Xác nhận"; }
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
  saveSession({ code, han: x.han, cats: Array.isArray(x.cats) && x.cats.length ? x.cats : ["*"] });
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
    const hint = (user && user.email) || ADMINS[0] || "";
    const c = google.accounts.oauth2.initTokenClient({
      client_id: CFG.CLIENT_ID, scope: DRIVE_SCOPE, prompt, hint, login_hint: hint,
      callback: r => r && r.access_token ? res(r) : rej(new Error((r && r.error) || "token")),
      error_callback: e => rej(new Error((e && e.type) || "popup"))
    });
    c.requestAccessToken({ prompt, hint, login_hint: hint });
  });
}
async function ensureDrive(force) {
  if (driveTok && !force) return driveTok;
  // Đã đăng nhập quản trị trên máy này: xin lại quyền Drive ngầm, không hỏi lại tài khoản
  if (isAdmin) { try { const r = await gisToken(""); saveTok(r.access_token, r.expires_in); return driveTok; } catch (e) { console.warn("gia hạn Drive", e.message); } }
  await adminLogin();
  if (!driveTok) throw new Error("Google chưa cấp quyền Drive.");
  return driveTok;
}

/* ---------- Google Drive ---------- */
async function drive(url, opt = {}, retried) {
  const tk = await ensureDrive();
  const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + tk } });
  if (r.status === 401) { saveTok(null); if (!retried) return drive(url, opt, true); throw new Error("Chưa gia hạn được quyền Drive. Bấm lại để thử lần nữa."); }
  const j = await r.json().catch(() => ({}));
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
    for (const c of CATS) {
      const f = byName(c.name) || await createFolder(c.name, root.id);
      cats[c.key] = f.id;
      const sub = await listChildren(f.id);
      for (const [g, cards] of Object.entries(c.sub || {})) {
        const gf = sub.find(x => x.mimeType === FOLDER && x.name === g) || await createFolder(g, f.id);
        const sub2 = await listChildren(gf.id);
        for (const k of cards) if (!sub2.find(x => x.mimeType === FOLDER && x.name === k)) await createFolder(k, gf.id);
      }
    }
    settings = { rootId: root.id, cats, created: new Date().toISOString() };
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
const META = ["issuer", "number", "issued", "effective", "status", "note", "star", "added"];
async function loadLive() {
  if (!settings || !CFG.DRIVE_KEY || (!isAdmin && !session)) return false;
  try {
    const allow = isAdmin ? null : (k => canCat(k));
    // Tìm tệp mới: đọc bằng quyền đăng nhập nếu quản trị đang có phiên Drive, nếu không đọc qua link chia sẻ
    let res;
    try {
      res = await buildFromDrive(publicList, isAdmin, null, allow);
    }
    catch (e) { if (isAdmin && driveTok) res = await buildFromDrive(listChildren, true, null, allow); else throw e; }
    const { newTree, newItems } = res;
    const meta = items; // dữ liệu ghi chú và thứ tự đã tải từ Firestore
    for (const [id, n] of Object.entries(newTree)) if (tree[id]) { if (Number.isFinite(tree[id].order)) n.order = tree[id].order; if (tree[id].imageUrl) n.imageUrl = tree[id].imageUrl; }
    for (const [id, it] of Object.entries(newItems)) if (meta[id]) { for (const k of [...META, "order"]) if (meta[id][k] !== undefined) it[k] = meta[id][k]; if (meta[id].name) it.name = meta[id].name; }
    for (const [id, m] of Object.entries(meta)) if (m.mime === "link" && newTree[m.parent]) newItems[id] = m; // tài liệu dạng link
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
    for (const [id, v] of Object.entries(newTree)) { const saved = oldTree[id] || {}; if (Number.isFinite(saved.order)) v.order = saved.order; if (saved.imageUrl) v.imageUrl = saved.imageUrl; if (JSON.stringify(saved) !== JSON.stringify(v)) ops.push({ type: "set", ref: doc(db, "pnd_tree", id), data: v }); }
    for (const id of Object.keys(oldTree)) if (!newTree[id]) ops.push({ type: "del", ref: doc(db, "pnd_tree", id) });
    for (const [id, v] of Object.entries(newItems)) { const o = oldItems[id] || {}; if (["name", "mime", "link", "modified", "size", "cat", "parent", "shared"].some(k => o[k] !== v[k])) ops.push({ type: "merge", ref: doc(db, "pnd_items", id), data: v }); }
    for (const [id, o] of Object.entries(oldItems)) if (!newItems[id] && o.mime !== "link") ops.push({ type: "del", ref: doc(db, "pnd_items", id) });
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
  const list = Object.values(items).filter(f => f.shared === false && f.mime !== "link" && f.cat !== "cho");
  if (!list.length) { toast("Mọi tài liệu đã được mở chia sẻ xem."); return; }
  if (!await ask("Mở chia sẻ “Bất kỳ ai có đường liên kết đều xem được” cho " + list.length + " tệp trong kho PND?\nNgười có mã tài khoản mới thấy được đường link trên web; nội dung tệp không bị sửa.")) return;
  setBusy("#btnShare", true, "Đang chia sẻ…");
  let ok = 0;
  try {
    for (const f of list) {
      try { await drive(`https://www.googleapis.com/drive/v3/files/${f.id}/permissions?sendNotificationEmail=false`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) }); f.shared = true; ok++;
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
  for (const c of CATS) {
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
  try {
    if (!isFolder && cur.mime === "link") { await setDoc(doc(db, "pnd_items", id), { parent: target, cat: tree[target].cat }, { merge: true }); }
    else {
      const f = await drive("https://www.googleapis.com/drive/v3/files/" + id + "?fields=parents");
      await drive("https://www.googleapis.com/drive/v3/files/" + id + "?addParents=" + target + "&removeParents=" + (f.parents || []).join(",") + "&fields=id", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    }
    await logAct("MOVE", cur.name + " → " + (tree[target] ? tree[target].name : target));
    toast("Đã chuyển “" + cur.name + "”. Đang cập nhật…", "ok");
    await scanDrive(true);
    go("f/" + encodeURIComponent(target));
  } catch (x) { toast("Chưa chuyển được: " + x.message, "err"); }
}

function setBusy(sel, on, label) { const b = $(sel); if (b) { b.disabled = on; b.textContent = label; } }

/* ---------- Thông dụng ---------- */
async function syncStar(f) {
  const rest = thongDung.filter(s => s.id !== f.id);
  thongDung = f.star ? [{ id: f.id, name: f.name, cat: f.cat, parent: f.parent }].concat(rest) : rest;
  await setDoc(doc(db, "pnd_settings", "thongdung"), { items: thongDung.slice(0, 60) });
}

/* ---------- Tải lên / nhập tài liệu ---------- */
let upMode = "file", upFilesSel = [];
function folderOptions(key) {
  const rootId = catRootId(key); if (!rootId) return "";
  const out = [];
  const walk = (id, lvl) => { const n = tree[id]; if (!n) return; out.push(`<option value="${esc(id)}">${"— ".repeat(lvl)}${esc(lvl ? n.name : CAT[key].name + " (thư mục gốc)")}</option>`); sortFolders(childrenOf(id)).forEach(c => walk(c.id, lvl + 1)); };
  walk(rootId, 0); return out.join("");
}
function openUpload(folderId, files) {
  if (!isAdmin) { openLogin(); setLoginTab("admin"); $("#loginErr").textContent = "Tải tài liệu lên cần đăng nhập quản trị."; return; }
  if (!settings) { toast("Chưa có cây thư mục. Bấm “Khởi tạo cây thư mục” trước.", "err"); return; }
  $("#upForm").reset(); $("#upErr").textContent = ""; $("#upMsg").textContent = ""; upFilesSel = []; $("#dropText").textContent = "Kéo thả tệp vào đây hoặc bấm để chọn";
  $("#upCat").innerHTML = CATS.map(c => `<option value="${c.key}">${esc(c.name)}</option>`).join("");
  const cur = currentCatKey(); if (cur && CAT[cur]) $("#upCat").value = cur;
  $("#upFolder").innerHTML = folderOptions($("#upCat").value);
  const h = decodeURIComponent(location.hash.slice(1));
  const target = folderId && tree[folderId] ? folderId : (h.startsWith("f/") && tree[h.slice(2)] ? h.slice(2) : (cur ? catRootId(cur) : ""));
  if (target && tree[target]) { $("#upCat").value = tree[target].cat; $("#upFolder").innerHTML = folderOptions(tree[target].cat); $("#upFolder").value = target; }
  $("#upTitle").textContent = target && tree[target] && tree[target].depth >= 2 ? "TẢI LÊN: " + tree[target].name.toUpperCase() : "TẢI TÀI LIỆU LÊN";
  if (files && files.length) { upFilesSel = [...files]; $("#dropText").textContent = upFilesSel.map(f => f.name).join(", "); }
  $("#newFolderWrap").hidden = false; setUpMode("file");
  $("#dlgUpload").showModal();
}
function setUpMode(m) { upMode = m; document.querySelectorAll("[data-up]").forEach(b => b.classList.toggle("on", b.dataset.up === m)); document.querySelectorAll("[data-uppane]").forEach(p => p.hidden = p.dataset.uppane !== m); }
function metaFrom(pref) {
  return { issuer: $(pref + "Issuer").value.trim(), number: $(pref + "Number").value.trim(), issued: $(pref + "Issued").value, effective: $(pref + "Effective").value, status: $(pref + "Status").value, note: $(pref + "Note").value.trim(), star: $(pref + "Star").checked };
}
async function submitUpload(e) {
  e.preventDefault();
  const key = $("#upCat").value; let parent = $("#upFolder").value;
  const meta = metaFrom("#up"), nameIn = $("#upName").value.trim(), newF = $("#upNewFolder").value.trim();
  if (!parent) { $("#upErr").textContent = "Chọn thư mục lưu."; return; }
  if (upMode === "file" && !upFilesSel.length) { $("#upErr").textContent = "Chọn ít nhất một tệp."; return; }
  if (upMode === "link") { try { const u = new URL($("#upUrl").value.trim()); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (x) { $("#upErr").textContent = "Đường link phải bắt đầu bằng http:// hoặc https://."; return; } if (!nameIn) { $("#upErr").textContent = "Nhập tên văn bản cho đường link."; return; } }
  if (upFilesSel.some(f => f.size > 50 * 1024 * 1024)) { $("#upErr").textContent = "Có tệp lớn hơn 50 MB; hãy tải trực tiếp lên Drive rồi bấm Quét."; return; }
  $("#upErr").textContent = ""; const btn = $("#upGo"); btn.disabled = true;
  try {
    if (newF) {
      $("#upMsg").textContent = "Đang tạo thư mục…";
      const f = await createFolder(newF, parent); const p = tree[parent];
      const node = { id: f.id, name: f.name, parent, cat: key, depth: (p ? p.depth : 1) + 1 };
      await setDoc(doc(db, "pnd_tree", f.id), node); tree[f.id] = node; parent = f.id;
    }
    const saved = [];
    if (upMode === "file") {
      let i = 0;
      for (const file of upFilesSel) {
        $("#upMsg").textContent = "Đang tải lên " + (++i) + "/" + upFilesSel.length + ": " + file.name;
        const d = await uploadFile(file, parent);
        const it = { ...fileItem(d, key, parent), ...meta, name: (nameIn && upFilesSel.length === 1) ? nameIn : d.name, added: new Date().toISOString() };
        await setDoc(doc(db, "pnd_items", it.id), it); items[it.id] = it; saved.push(it);
      }
    } else {
      const it = { id: "lk-" + rid(), name: nameIn, mime: "link", link: $("#upUrl").value.trim(), cat: key, parent, shared: true, ...meta, added: new Date().toISOString() };
      await setDoc(doc(db, "pnd_items", it.id), it); items[it.id] = it; saved.push(it);
    }
    for (const it of saved) if (it.star) await syncStar(it);
    await logAct(upMode === "file" ? "UPLOAD" : "LINK", saved.map(s => s.name).join("; "));
    $("#dlgUpload").close();
    toast("Đã lưu " + saved.length + " tài liệu.", "ok");
    go("f/" + parent);
  } catch (x) { $("#upErr").textContent = x.message || "Chưa lưu được."; $("#upMsg").textContent = ""; }
  finally { btn.disabled = false; }
}

/* ---------- Sửa thông tin tài liệu ---------- */
let editing = null;
function openEdit(id) {
  const f = items[id]; if (!f) return; editing = id;
  $("#edName").value = f.name || ""; $("#edIssuer").value = f.issuer || ""; $("#edNumber").value = f.number || ""; $("#edIssued").value = f.issued || ""; $("#edEffective").value = f.effective || ""; $("#edStatus").value = f.status || ""; $("#edNote").value = f.note || ""; $("#edStar").checked = !!f.star; $("#edErr").textContent = "";
  $("#dlgEdit").showModal();
}
async function submitEdit(e) {
  e.preventDefault(); const f = items[editing]; if (!f) return;
  const patch = { id: f.id, cat: f.cat, parent: f.parent, link: f.link || "", mime: f.mime || "", ...metaFrom("#ed"), name: $("#edName").value.trim() || f.name };
  try { await setDoc(doc(db, "pnd_items", f.id), patch, { merge: true }); Object.assign(f, patch); await syncStar(f); $("#dlgEdit").close(); toast("Đã lưu thông tin.", "ok"); route(); }
  catch (x) { $("#edErr").textContent = x.message; }
}

/* ---------- Quản lý mã tài khoản (như mã lớp PNL) ---------- */
async function renderAccounts() {
  if (!isAdmin) {
    $("#main").innerHTML = `<section class="box"><h2 class="box-title">QUẢN LÝ MÃ TÀI KHOẢN</h2><p class="empty">Chỉ quản trị viên được cấp mã. Đăng nhập bằng tài khoản Google quản trị.</p><div style="text-align:center"><button type="button" class="pill" style="width:auto;display:inline-block;padding:10px 24px" data-adminlogin>ĐĂNG NHẬP QUẢN TRỊ</button></div>${navRow()}</section>`;
    return;
  }
  const d = new Date(); d.setMonth(d.getMonth() + 6); const def = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  $("#main").innerHTML = `<section class="box"><h2 class="box-title">QUẢN LÝ MÃ TÀI KHOẢN</h2>
    <form id="maForm" novalidate>
      <p class="muted" id="maHelp">Một mã dùng chung cho nhiều người. Mỗi mã mở một hoặc nhiều danh mục (giống mã lớp của PN Library); người vượt quá số người cho phép sẽ bị từ chối.</p>
      <div class="grid2">
        <label class="fld"><span>Mã</span><input id="maCode" maxlength="24" placeholder="Ví dụ: PND2026" style="text-transform:uppercase" autocomplete="off"></label>
        <label class="fld"><span>Số người được dùng mã</span><input id="maMax" type="number" min="1" max="1000" value="20"></label>
        <label class="fld"><span>Hết hạn ngày</span><input id="maHan" type="date" value="${def}"></label>
        <label class="fld"><span>Ghi chú</span><input id="maNote" maxlength="80" placeholder="Ví dụ: Tổ bộ môn Luật Dân sự"></label>
      </div>
      <div class="fld" style="margin-top:8px"><span>Danh mục được xem</span>
        <div class="cat-checks"><label><input type="checkbox" id="maAll" checked> <b>Tất cả danh mục</b></label>${PUBLIC_CATS.map(c => `<label><input type="checkbox" class="maCat" value="${c.key}" disabled> ${esc(c.name)}</label>`).join("")}</div>
      </div>
      <p class="err" id="maErr"></p><p class="muted" id="maMsg"></p>
      <div class="dlg-act"><button type="button" class="btn" id="maCancel" hidden>Hủy sửa</button><button type="submit" class="btn primary" id="maGo">Cấp mã</button></div>
    </form>
    <div class="grp-title" style="margin-top:18px">Danh sách mã <span class="muted" id="maCount"></span></div>
    <div class="tbl-wrap"><table class="adm-table"><thead><tr><th>Mã</th><th>Ghi chú</th><th>Danh mục</th><th>Hạn dùng</th><th>Đã dùng</th><th>Trạng thái</th><th></th></tr></thead><tbody id="maBody"><tr><td colspan="7" class="muted">Đang tải…</td></tr></tbody></table></div>
    ${navRow()}</section>`;
  let EDIT = null, LIST = [];
  const setCats = cs => { const all = !cs || !cs.length || cs.includes("*"); $("#maAll").checked = all; document.querySelectorAll(".maCat").forEach(x => { x.disabled = all; x.checked = !all && cs.includes(x.value); }); };
  $("#maAll").onchange = () => document.querySelectorAll(".maCat").forEach(x => { x.disabled = $("#maAll").checked; if (x.disabled) x.checked = false; });
  const stop = () => { EDIT = null; $("#maForm").reset(); $("#maHan").value = def; $("#maCode").readOnly = false; setCats(["*"]); $("#maGo").textContent = "Cấp mã"; $("#maCancel").hidden = true; };
  $("#maCancel").onclick = stop;
  async function list() {
    try {
      const snap = await getDocs(collection(db, "pnd_ma")); LIST = [];
      for (const d of snap.docs) { const x = d.data(); LIST.push({ code: d.id, ...x, used: (await getDocs(collection(db, "pnd_ma", d.id, "luot"))).size }); }
      LIST.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
      $("#maCount").textContent = LIST.length ? "(" + LIST.length + " mã)" : "";
      const t = todayISO();
      $("#maBody").innerHTML = LIST.length ? LIST.map(x => { const exp = t > x.han, full = x.max && x.used >= x.max; const cs = !x.cats || x.cats.includes("*") ? "Tất cả" : x.cats.map(k => CAT[k] ? CAT[k].name : k).join(", ");
        return `<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.note || "")}</td><td>${esc(cs)}</td><td>${fmtDate(x.han)}</td><td>${Math.min(x.used, x.max || x.used)} / ${x.max || "—"}</td><td>${exp ? '<span class="badge bad">Hết hạn</span>' : full ? '<span class="badge bad">Đủ người</span>' : '<span class="badge ok">Hiệu lực</span>'}</td><td style="white-space:nowrap"><button type="button" class="btn" data-maedit="${esc(x.code)}">Sửa</button> <button type="button" class="btn" data-madel="${esc(x.code)}">Xóa</button></td></tr>`; }).join("")
        : '<tr><td colspan="7" class="muted">Chưa có mã nào.</td></tr>';
      $("#maBody").querySelectorAll("[data-maedit]").forEach(b => b.onclick = () => { const x = LIST.find(y => y.code === b.dataset.maedit); EDIT = x.code; $("#maCode").value = x.code; $("#maCode").readOnly = true; $("#maMax").value = x.max || 20; $("#maHan").value = x.han; $("#maNote").value = x.note || ""; setCats(x.cats); $("#maGo").textContent = "Lưu thay đổi"; $("#maCancel").hidden = false; $("#maForm").scrollIntoView({ behavior: "smooth" }); });
      $("#maBody").querySelectorAll("[data-madel]").forEach(b => b.onclick = async () => {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Bấm lần nữa để xóa"; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Xóa"; } }, 4000); return; }
        b.disabled = true; const code = b.dataset.madel;
        try { const ops = []; (await getDocs(collection(db, "pnd_ma", code, "luot"))).forEach(d => ops.push({ type: "del", ref: d.ref })); ops.push({ type: "del", ref: doc(db, "pnd_ma", code) }); await commitOps(ops); await logAct("CODE_DEL", code); $("#maMsg").textContent = "Đã xóa mã " + code + "."; list(); }
        catch (x) { $("#maErr").textContent = x.message; b.disabled = false; }
      });
    } catch (x) { $("#maBody").innerHTML = `<tr><td colspan="7" class="err">Chưa tải được danh sách: ${esc(x.message)}</td></tr>`; }
  }
  $("#maForm").onsubmit = async e => {
    e.preventDefault();
    const code = norm($("#maCode").value), max = parseInt($("#maMax").value, 10), han = $("#maHan").value, note = $("#maNote").value.trim();
    const all = $("#maAll").checked, cats = all ? ["*"] : [...document.querySelectorAll(".maCat:checked")].map(x => x.value);
    if (!okCode(code)) { $("#maErr").textContent = "Mã gồm 3–24 ký tự: chữ không dấu, chữ số, gạch ngang hoặc gạch dưới."; return; }
    if (!(max >= 1 && max <= 1000)) { $("#maErr").textContent = "Số người từ 1 đến 1000."; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(han) || han < todayISO()) { $("#maErr").textContent = "Chọn ngày hết hạn từ hôm nay trở đi."; return; }
    if (!cats.length) { $("#maErr").textContent = "Chọn ít nhất một danh mục."; return; }
    $("#maErr").textContent = ""; $("#maGo").disabled = true;
    try {
      const ref = doc(db, "pnd_ma", code);
      if (!EDIT && (await getDoc(ref)).exists()) throw new Error("Mã này đã có; hãy đặt mã khác.");
      const hanTs = Timestamp.fromDate(new Date(han + "T23:59:59+07:00"));
      await setDoc(ref, { note, han, hanTs, max, cats, ...(EDIT ? { updated: new Date().toISOString() } : { created: new Date().toISOString() }) }, { merge: !!EDIT });
      await logAct(EDIT ? "CODE_EDIT" : "CODE_NEW", code);
      $("#maMsg").textContent = (EDIT ? "Đã cập nhật mã " : "Đã cấp mã ") + code + "."; stop(); list();
    } catch (x) { $("#maErr").textContent = x.message; } finally { $("#maGo").disabled = false; }
  };
  list();
}

/* ---------- Hỏi AI (Gemini qua Firebase AI Logic) ---------- */
let aiChat = null;
function aiAdd(cls, text) { const p = document.createElement("div"); p.className = "ai-msg " + cls; p.textContent = text; $("#aiLog").appendChild(p); $("#aiLog").scrollTop = 1e9; return p; }
function contextText() {
  const lines = Object.values(items).filter(f => canCat(f.cat)).slice(0, 700).map(f => "- [" + pathOf(f.parent).map(p => p.name).join(" > ") + "] " + f.name + (f.issuer ? "; ban hành bởi " + f.issuer : "") + (f.issued ? "; ngày " + fmtDate(f.issued) : "") + (f.number ? "; số " + f.number : "") + (f.effective ? "; hiệu lực từ " + fmtDate(f.effective) : "") + (f.status ? "; " + f.status : "") + (f.note ? "; ghi chú: " + f.note : ""));
  return lines.length ? lines.join("\n") : "(chưa có tài liệu nào trong phạm vi người dùng được xem)";
}
async function getChat() {
  if (aiChat) return aiChat;
  if (!CFG.APPCHECK_SITE_KEY) throw new Error("Trợ lý AI đang chờ kích hoạt (cần hoàn tất đăng ký Gemini và App Check).");
  const [{ initializeAppCheck, ReCaptchaEnterpriseProvider }, { getAI, getGenerativeModel, GoogleAIBackend }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-check.js"),
    import("https://www.gstatic.com/firebasejs/12.0.0/firebase-ai.js")
  ]);
  try { initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(CFG.APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true }); } catch (e) {}
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, { model: CFG.AI_MODEL || "gemini-2.5-flash", systemInstruction: "Bạn là trợ lý của thư viện số Phúc Nguyên Digital (tài liệu pháp luật, quy chế, chương trình đào tạo, giảng dạy, nghiên cứu). Trả lời bằng tiếng Việt, ngắn gọn, chính xác. Khi câu hỏi liên quan tới tài liệu trong thư viện, chỉ ra tên tài liệu và thư mục chứa nó dựa trên danh mục được cung cấp. Nếu danh mục không có thông tin, nói rõ là thư viện chưa có và trả lời theo hiểu biết chung kèm lưu ý cần kiểm tra văn bản gốc còn hiệu lực. Không bịa số hiệu văn bản." });
  aiChat = model.startChat({ history: [{ role: "user", parts: [{ text: "Danh mục tài liệu tôi được xem trong thư viện:\n" + contextText() }] }, { role: "model", parts: [{ text: "Đã nhận danh mục. Mời bạn đặt câu hỏi." }] }] });
  return aiChat;
}
function openAI() {
  if (!isAdmin && !session) { openLogin("Nhập mã tài khoản để dùng trợ lý AI."); return; }
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
  } catch (x) { bot.textContent = "Chưa hỏi được: " + (x.message || x); aiChat = null; }
}

/* ---------- Sự kiện ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-cat],[data-folder],[data-home],[data-back],[data-go],[data-login],[data-adminlogin],[data-edit],[data-move],[data-movefolder],[data-upload],[data-fnew],[data-fren],[data-fdel],[data-fimg],[data-star],[data-close],[data-image-close]");
  if (!t) return;
  if (t.dataset.cat) { e.preventDefault(); go("dm/" + t.dataset.cat); }
  else if (t.dataset.folder) { e.preventDefault(); go("f/" + encodeURIComponent(t.dataset.folder)); }
  else if (t.hasAttribute("data-home")) { e.preventDefault(); go(""); }
  else if (t.hasAttribute("data-back")) { e.preventDefault(); history.length > 1 ? history.back() : go(""); }
  else if (t.dataset.go) { e.preventDefault(); go(t.dataset.go); }
  else if (t.hasAttribute("data-login")) openLogin();
  else if (t.hasAttribute("data-adminlogin")) { openLogin(); setLoginTab("admin"); }
  else if (t.dataset.edit) openEdit(t.dataset.edit);
  else if (t.dataset.move) moveTo(t.dataset.move, false);
  else if (t.dataset.movefolder) moveTo(t.dataset.movefolder, true);
  else if (t.dataset.upload) openUpload(t.dataset.upload);
  else if (t.dataset.fnew) newFolder(t.dataset.fnew);
  else if (t.dataset.fren) renameFolder(t.dataset.fren);
  else if (t.dataset.fdel) deleteFolder(t.dataset.fdel);
  else if (t.dataset.fimg) setFolderImage(t.dataset.fimg);
  else if (t.dataset.star) { const f = items[t.dataset.star]; if (f && f.link) window.open(f.link, "_blank", "noopener"); else { const s = thongDung.find(x => x.id === t.dataset.star); if (s && !canCat(s.cat)) openLogin("Nhập mã tài khoản có quyền xem danh mục “" + (CAT[s.cat] ? CAT[s.cat].name : "") + "”."); else if (s) go("f/" + encodeURIComponent(s.parent)); } }
  else if (t.hasAttribute("data-close") || t.hasAttribute("data-image-close")) t.closest("dialog").close();
});
document.querySelectorAll("#dlgLogin .tab").forEach(b => b.onclick = () => setLoginTab(b.dataset.tab));
$("#btnLogin").onclick = () => openLogin("Nhập mã tài khoản do giảng viên cấp để xem tài liệu.");
$("#btnLogout").onclick = async () => { if (!await ask("Thoát khỏi Phúc Nguyên Digital trên máy này?")) return; saveSession(null); saveTok(null); aiChat = null; $("#aiLog").innerHTML = ""; if (auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth); else { isAdmin = false; await afterAuth(); } toast("Đã thoát."); };
$("#loginForm").onsubmit = async e => {
  e.preventDefault(); const btn = $("#loginGo"); btn.disabled = true; $("#loginErr").textContent = loginTab === "admin" ? "Đang mở cửa sổ đăng nhập Google…" : "Đang kiểm tra mã…";
  try {
    if (loginTab === "admin") {
      const em = $("#admEmail").value.trim(), pw = $("#admPass").value;
      if (em && pw) { const r = await signInWithEmailAndPassword(auth, em, pw); if (!isAdminUser(r.user)) { await signOut(auth); throw new Error("Tài khoản này không phải quản trị."); } }
      else await adminLogin();
    }
    else { await useCode($("#codeInput").value); await loadItems(); await loadLive(); }
    $("#dlgLogin").close(); $("#loginErr").textContent = "";
    toast(loginTab === "admin" ? "Đã đăng nhập quản trị." : "Đã xác nhận mã tài khoản.", "ok");
    route();
  } catch (x) { $("#loginErr").textContent = /auth\/(invalid-credential|wrong-password|user-not-found|invalid-email)/.test(x.code || "") ? "Email hoặc mật khẩu chưa đúng." : x.code === "auth/popup-blocked" ? "Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên rồi thử lại." : x.code === "auth/popup-closed-by-user" ? "Cửa sổ đăng nhập đã bị đóng." : (x.message || "Chưa đăng nhập được."); }
  finally { btn.disabled = false; }
};
$("#searchForm").onsubmit = e => { e.preventDefault(); const q = $("#searchInput").value.trim(); if (q) go("tim/" + encodeURIComponent(q)); };
$("#btnUpload").onclick = () => openUpload();
// Kéo thả tệp vào khung thư mục đang mở → mở hộp tải lên với đúng thư mục
document.addEventListener("dragstart", e => { const row = e.target.closest && e.target.closest("[data-sort-id]"); if (!isAdmin || !row) return; dragItem = row.dataset; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.dataset.sortId); row.classList.add("is-dragging"); });
document.addEventListener("dragend", e => { const row = e.target.closest && e.target.closest("[data-sort-id]"); if (row) row.classList.remove("is-dragging"); document.querySelectorAll(".sort-over").forEach(x => x.classList.remove("sort-over")); dragItem = null; });
document.addEventListener("dragover", e => { const row = e.target.closest && e.target.closest("[data-sort-id]"); if (isAdmin && dragItem && row && row.dataset.sortKind === dragItem.sortKind && row.dataset.sortParent === dragItem.sortParent) { e.preventDefault(); row.classList.add("sort-over"); } const z = e.target.closest && e.target.closest(".dropzone"); if (z && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); z.classList.add("drag"); } });
document.addEventListener("dragleave", e => { const z = e.target.closest && e.target.closest(".dropzone"); if (z && !z.contains(e.relatedTarget)) z.classList.remove("drag"); });
document.addEventListener("drop", async e => {
  const row = e.target.closest && e.target.closest("[data-sort-id]");
  if (isAdmin && dragItem && row && row.dataset.sortKind === dragItem.sortKind && row.dataset.sortParent === dragItem.sortParent) {
    e.preventDefault(); row.classList.remove("sort-over");
    const kind = dragItem.sortKind, parent = dragItem.sortParent, movingId = dragItem.sortId, targetId = row.dataset.sortId;
    if (movingId !== targetId) {
      const source = kind === "folder" ? sortFolders(childrenOf(parent)) : sortFiles(filesOf(parent));
      const ids = source.map(x => x.id).filter(id => id !== movingId); const at = ids.indexOf(targetId); ids.splice(at < 0 ? ids.length : at, 0, movingId);
      try { await saveOrder(kind, parent, ids); toast("Đã cập nhật thứ tự.", "ok"); route(); } catch (x) { toast("Không lưu được thứ tự: " + x.message, "err"); }
    }
    dragItem = null; return;
  }
  const z = e.target.closest && e.target.closest(".dropzone"); if (!z || !e.dataTransfer.files.length || $("#dlgUpload").open) return; e.preventDefault(); z.classList.remove("drag"); openUpload(z.dataset.dropfolder, e.dataTransfer.files); });
$("#btnAI").onclick = openAI;
$("#btnScan").onclick = () => scanDrive(false);
$("#btnInit").onclick = initTree;
$("#btnShare").onclick = shareAll;
$("#btnSource").onclick = addSource;
$("#upCat").onchange = () => { $("#upFolder").innerHTML = folderOptions($("#upCat").value); };
document.querySelectorAll("[data-up]").forEach(b => b.onclick = () => setUpMode(b.dataset.up));
$("#upFiles").onchange = () => { upFilesSel = [...$("#upFiles").files]; $("#dropText").textContent = upFilesSel.length ? upFilesSel.map(f => f.name).join(", ") : "Kéo thả tệp vào đây hoặc bấm để chọn"; };
const dropEl = $("#drop");
dropEl.ondragover = e => { e.preventDefault(); dropEl.classList.add("drag"); };
dropEl.ondragleave = () => dropEl.classList.remove("drag");
dropEl.ondrop = e => { e.preventDefault(); dropEl.classList.remove("drag"); upFilesSel = [...e.dataTransfer.files]; $("#dropText").textContent = upFilesSel.map(f => f.name).join(", "); };
$("#upForm").onsubmit = submitUpload;
$("#edForm").onsubmit = submitEdit;
$("#aiForm").onsubmit = askAI;
$("#aiInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#aiForm").requestSubmit(); } });
window.addEventListener("hashchange", route);

/* ---------- Khởi động ---------- */
async function afterAuth() {
  isAdmin = isAdminUser(user);
  if (!isAdmin && session && user) {
    // Bảo đảm tài khoản ẩn danh hiện tại đã ghi mã (khi trình duyệt xóa dữ liệu đăng nhập)
    try { const u = await getDoc(doc(db, "pnd_users", user.uid)); if (!u.exists() || u.data().code !== session.code) await useCode(session.code); }
    catch (e) { if (e.invalidCode) { saveSession(null); toast(e.message + " Hãy nhập mã mới.", "err"); } }
  }
  await loadItems();
  // Hiện ngay bản đã lưu trên máy, rồi đọc lại Drive
  try { const c = JSON.parse(localStorage.getItem("pnd_live2") || "null"); if (c && c.who === (isAdmin ? "admin" : session && session.code) && Date.now() - c.t < 6 * 3600e3) { Object.assign(tree, c.tree); for (const [id, it] of Object.entries(c.items)) items[id] = { ...it, ...(items[id] || {}) }; } } catch (e) {}
  if (await loadLive()) { try { localStorage.setItem("pnd_live2", JSON.stringify({ t: Date.now(), who: isAdmin ? "admin" : session && session.code, tree, items })); } catch (e) {} }
  authReady = true;
  if (isAdmin && liveState === "private") $("#adminNote").textContent = "Thư mục gốc PND chưa chia sẻ “Bất kỳ ai có đường liên kết”: người dùng mã chưa xem được tài liệu.";
  const dl = $("#dlgLogin"); if (dl.open && (isAdmin || session)) dl.close();
  route();
}
route();
onAuthStateChanged(auth, async u => {
  user = u;
  if (!u && session) { try { await signInAnonymously(auth); return; } catch (e) {} }
  if (!loaded.tree) { await loadSettings(); await loadTree(); }
  await afterAuth();
});
