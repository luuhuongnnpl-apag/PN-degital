/**
 * PND - Phúc Nguyên Digital
 * Source Drive folder is READ-ONLY. Uploads go to a separate PND_INBOX folder.
 * The first authorized administrator runs initializePND() once.
 */
const PND = {
  SOURCE_FOLDER_ID: "1Jt2Kp1o44elRiDdHfQ2lEx9vEbruET_Y",
  INBOX_NAME: "PND_TIEP_NHAN",
  DB_NAME: "PND_CATALOG_PRIVATE",
  MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
  MAX_SCAN_FILES: 500,
  CATEGORIES: ["Chương trình đào tạo","Đề cương","Tài liệu giảng dạy","Nghiên cứu khoa học","Văn bản quy chế","Y học - Sức khỏe","Thể thao vận động","Tài liệu khác","Chờ phân loại"]
};

function doGet() {
  assertAdmin_();
  return HtmlService.createHtmlOutputFromFile("Admin")
    .setTitle("PND - Quản lý tài liệu")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function initializePND() {
  assertAdmin_();
  const props = PropertiesService.getScriptProperties();
  const source = DriveApp.getFolderById(PND.SOURCE_FOLDER_ID);
  if (!source) throw new Error("Không truy cập được thư mục nguồn.");
  let inboxId = props.getProperty("INBOX_FOLDER_ID");
  let inbox;
  if (inboxId) {
    inbox = DriveApp.getFolderById(inboxId);
  } else {
    const existing = DriveApp.getFoldersByName(PND.INBOX_NAME);
    inbox = existing.hasNext() ? existing.next() : DriveApp.createFolder(PND.INBOX_NAME);
    props.setProperty("INBOX_FOLDER_ID", inbox.getId());
  }
  let ssId = props.getProperty("DB_SPREADSHEET_ID");
  let ss;
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create(PND.DB_NAME);
    props.setProperty("DB_SPREADSHEET_ID", ss.getId());
    setupSheets_(ss);
  }
  return {
    ok:true,
    sourceName:source.getName(),
    sourceId:PND.SOURCE_FOLDER_ID,
    inboxName:inbox.getName(),
    inboxId:inbox.getId(),
    catalogUrl:ss.getUrl(),
    message:"Đã khởi tạo. Thư mục nguồn không bị thay đổi."
  };
}

function getDashboard() {
  assertAdmin_();
  const ss = db_();
  const sh = ss.getSheetByName("Catalog");
  const rows = sh.getLastRow()>1 ? sh.getRange(2,1,sh.getLastRow()-1,10).getValues() : [];
  return {
    ok:true, categories:PND.CATEGORIES,
    total:rows.length,
    pinned:rows.filter(r=>r[7]===true).slice(0,4).map(rowToItem_),
    recent:rows.sort((a,b)=>new Date(b[5])-new Date(a[5])).slice(0,30).map(rowToItem_),
    inboxUrl:"https://drive.google.com/drive/folders/"+PropertiesService.getScriptProperties().getProperty("INBOX_FOLDER_ID")
  };
}

/** Bounded recursive metadata-only scan. Never edits or moves source files. */
function syncSourceFolder() {
  assertAdmin_();
  const root=DriveApp.getFolderById(PND.SOURCE_FOLDER_ID);
  const ss=db_(), sh=ss.getSheetByName("Catalog"), log=ss.getSheetByName("Activity");
  const existing={};
  if(sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1,10).getValues().forEach((r,i)=>existing[r[0]]=i+2);
  const queue=[root]; let processed=0, added=0, updated=0;
  while(queue.length && processed<PND.MAX_SCAN_FILES){
    const folder=queue.shift(), files=folder.getFiles();
    while(files.hasNext() && processed<PND.MAX_SCAN_FILES){
      const f=files.next(); processed++;
      const id=f.getId(), name=f.getName(), mime=f.getMimeType();
      if(/^image\//.test(mime)||/^video\//.test(mime)) continue;
      const modified=f.getLastUpdated(), oldRow=existing[id];
      const row=[id,name,mime,f.getUrl(),f.getSize(),modified,"Nguồn đồng bộ",false,"Chờ phân loại",folder.getName()];
      if(!oldRow){sh.appendRow(row);added++;log.appendRow([new Date(),"SYNC_ADD",id,name,Session.getActiveUser().getEmail()]);}
      else {
        const old=sh.getRange(oldRow,1,1,10).getValues()[0];
        row[7]=old[7]; row[8]=old[8];
        if(String(old[5])!==String(modified)||old[1]!==name){sh.getRange(oldRow,1,1,10).setValues([row]);updated++;}
      }
    }
    const subs=folder.getFolders();
    while(subs.hasNext()) queue.push(subs.next());
  }
  return {ok:true,processed,added,updated,limitReached:processed>=PND.MAX_SCAN_FILES,
    note:"Chỉ đọc metadata trong thư mục nguồn và thư mục con; không tải nội dung, sửa hoặc di chuyển tệp."};
}

function uploadDocument(payload) {
  assertAdmin_();
  if(!payload||!payload.name||!payload.data) throw new Error("Thiếu tệp tải lên.");
  const bytes=Utilities.base64Decode(payload.data);
  if(bytes.length>PND.MAX_UPLOAD_BYTES) throw new Error("Tệp vượt giới hạn 8 MB.");
  const safeName=String(payload.name).replace(/[\\/:*?"<>|]/g,"_");
  const mime=payload.mimeType||"application/octet-stream";
  const blob=Utilities.newBlob(bytes,mime,safeName);
  const folder=DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("INBOX_FOLDER_ID"));
  const file=folder.createFile(blob);
  const ss=db_();
  ss.getSheetByName("Catalog").appendRow([file.getId(),file.getName(),file.getMimeType(),file.getUrl(),file.getSize(),file.getLastUpdated(),"Tải lên PND",false,PND.CATEGORIES.includes(payload.category)?payload.category:"Chờ phân loại",folder.getName()]);
  ss.getSheetByName("Activity").appendRow([new Date(),"UPLOAD",file.getId(),file.getName(),Session.getActiveUser().getEmail()]);
  return {ok:true,name:file.getName(),url:file.getUrl(),id:file.getId()};
}

function updateDocument(id, changes) {
  assertAdmin_();
  const sh=db_().getSheetByName("Catalog"), row=findRow_(sh,id);
  if(!row) throw new Error("Không tìm thấy tài liệu trong danh mục.");
  if(changes.category && PND.CATEGORIES.includes(changes.category)) sh.getRange(row,9).setValue(changes.category);
  if(typeof changes.pinned==="boolean") sh.getRange(row,8).setValue(changes.pinned);
  sh.getSheetByName; // intentional no-op avoided below
  db_().getSheetByName("Activity").appendRow([new Date(),"UPDATE_METADATA",id,changes.category||"PIN",Session.getActiveUser().getEmail()]);
  return {ok:true};
}

function searchDocuments(query) {
  assertAdmin_();
  const q=String(query||"").toLowerCase().trim(), sh=db_().getSheetByName("Catalog");
  if(!q) return [];
  const rows=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,10).getValues():[];
  return rows.filter(r=>(r[1]+" "+r[8]+" "+r[6]).toLowerCase().includes(q)).slice(0,100).map(rowToItem_);
}

function assertAdmin_() {
  const email=Session.getActiveUser().getEmail();
  const allowed=(PropertiesService.getScriptProperties().getProperty("ADMIN_EMAILS")||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!email || !allowed.includes(email.toLowerCase())) throw new Error("Tài khoản chưa được cấp quyền quản trị PND. Hãy thiết lập ADMIN_EMAILS trong Script Properties.");
}
function db_(){const id=PropertiesService.getScriptProperties().getProperty("DB_SPREADSHEET_ID");if(!id)throw new Error("Chưa khởi tạo PND. Hãy chạy initializePND().");return SpreadsheetApp.openById(id);}
function setupSheets_(ss){
  const c=ss.getSheets()[0];c.setName("Catalog");c.appendRow(["File ID","Tên tài liệu","MIME","URL","Dung lượng","Cập nhật","Nguồn","Ghim","Danh mục","Thư mục"]);
  const a=ss.insertSheet("Activity");a.appendRow(["Thời điểm","Thao tác","File ID","Tên/Chi tiết","Người thực hiện"]);
}
function findRow_(sh,id){if(sh.getLastRow()<2)return 0;const f=sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(String(id)).matchEntireCell(true).findNext();return f?f.getRow():0;}
function rowToItem_(r){return {id:r[0],name:r[1],mimeType:r[2],url:r[3],size:r[4],updated:r[5],source:r[6],pinned:r[7],category:r[8],folder:r[9]};}
