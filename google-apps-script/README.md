# PND – Phúc Nguyên Digital (Apps Script backend)

## Architecture
- Public GitHub Pages is only the presentation layer; do not publish Drive IDs, document links, indexes, or personal data there.
- Source folder (read-only by application logic): `1Jt2Kp1o44elRiDdHfQ2lEx9vEbruET_Y`.
- Separate upload destination: `PND_TIEP_NHAN`, created on first initialization.
- Private catalog and activity log: a private Google Spreadsheet created by `initializePND()`.

## Setup (owner action required)
1. Create/open the Apps Script project attached to the PND repository files.
2. Set Script Property `ADMIN_EMAILS` to the exact Google account email(s) allowed to administer PND, comma-separated. Do not put this in GitHub.
3. Deploy as a Web App with **Execute as: User accessing the web app** and **Who has access: Only myself** for the pilot. This ensures the admin identity is checked. Do not make this endpoint public.
4. Open the deployment URL while signed in as the authorized account and approve Google OAuth scopes.
5. Run **Khởi tạo / kiểm tra kết nối** once. This creates `PND_TIEP_NHAN` and a private catalog spreadsheet. Save both URLs privately.
6. Run **Đồng bộ thư mục nguồn**. The scanner reads metadata recursively from the configured source folder, bounded to 500 files per run.

## Implemented in pilot
- Drag/drop and multi-file upload into a separate folder (8 MB/file limit).
- Metadata-only recursive source sync (500 files/run); source files are not modified or moved.
- Private catalog, text search, category assignment, pinning and activity log.
- Admin email allow-list.

## Important limits
- The Drive OAuth scope is write-capable because uploads and folder/database creation require it. The code writes only to the dedicated inbox and private catalog; the source scanner uses read operations only. Review the code before granting access.
- Version history is not yet a Drive revision browser. The activity sheet records PND operations and detected metadata updates; it does not preserve historical binary revisions.
- A 500-file cap is a safety limit, not a guarantee that every nested folder is indexed in one run. Repeat sync until the reported limit is not reached.
- This backend is private for the pilot. Do not embed its deployment URL or document links in public GitHub Pages.
- Do not claim production-ready until owner OAuth authorization, Apps Script deployment, upload test, source-sync test, and desktop/mobile UI checks pass.
