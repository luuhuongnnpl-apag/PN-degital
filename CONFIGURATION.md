# PND – GitHub Pages + Firebase + Google Drive API

Không dùng Apps Script hay máy chủ trung gian. Trình duyệt dùng Firebase Auth (đăng nhập Google), Firestore, Google Picker và Drive REST API.

## Cấu hình đã thiết lập (04/11/2026) — dự án Google Cloud/Firebase `phuc-nguyen-library`
- Firebase Auth: bật đăng nhập Google; tên miền được phép `luuhuongnnpl-apag.github.io`.
- Đã bật Google Drive API và Google Picker API.
- Màn hình xin quyền OAuth: External, In production; phạm vi `drive.file` (không nhạy cảm).
- OAuth client web: `842652271567-7d5orqj763rlrsiu2kq4ne0170fp9dsr.apps.googleusercontent.com`, nguồn JavaScript `https://luuhuongnnpl-apag.github.io`.
- API key "PND Picker key": chỉ Picker API, chỉ chạy trên `https://luuhuongnnpl-apag.github.io/*`.
- Tất cả giá trị nằm trong `config.js` (định danh công khai, không có client secret).

## Dữ liệu
| Nội dung | Nơi lưu | Ai xem |
|---|---|---|
| Tệp gốc | Google Drive (kho nguồn + thư mục tiếp nhận) | theo quyền Drive |
| Tài liệu nhập thủ công | Firestore `pnd_catalog` | "Công khai": mọi người; "Có điều kiện", "Nội bộ": chỉ quản trị |
| Phân loại/ghim tệp Drive | Firestore `pnd_drive_items` | chỉ quản trị |
| Nhật ký hoạt động | Firestore `pnd_activity` | chỉ quản trị |
| Thư mục nguồn/tiếp nhận đã chọn | Firestore `pnd_settings/folders` | chỉ quản trị |

Quản trị viên: tài khoản Google trong `ADMIN_EMAILS` (config.js), đối chiếu trong Quy tắc bảo mật Firestore.

## Chuyển dữ liệu cũ (tự động)
- Bản ghi nhập thủ công lưu trong trình duyệt (localStorage) được tự chuyển lên Firestore khi quản trị viên đăng nhập trên máy đó.
- `pnd-catalog.json` cũ trong thư mục tiếp nhận Drive được tự chuyển ở lần tải danh mục đầu tiên.
- `data/documents.json` vẫn được đọc như danh mục công khai bổ sung.

## Giới hạn
- Phiên Drive (access token) hết hạn sau khoảng 1 giờ: bấm "Kết nối Google Drive" để cấp lại.
- 500 tệp metadata mỗi lần quét, 8 MB mỗi tệp tải lên.
- Nhãn truy cập bảo vệ bản ghi danh mục trên Firestore; việc mở tệp gốc vẫn do quyền chia sẻ Drive quyết định.
