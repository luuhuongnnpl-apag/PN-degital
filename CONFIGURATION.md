# Phúc Nguyên Digital (PND) — GitHub Pages + Firebase + Google Drive

Giao diện mới (04/11/2026) theo bản vẽ của giảng viên: Danh mục thư viện (8 mục) · Thông dụng · Liên kết · Quản lý dữ liệu.

## Mã nguồn
- `index.html` — khung trang, hộp thoại (đăng nhập, tải lên, sửa thông tin, hỏi AI)
- `assets/pnd.css` — giao diện; `assets/pnd.js` — toàn bộ chức năng (Firebase JS SDK 12.0.0, dạng module)
- `config.js` — cấu hình công khai (Firebase, email quản trị, khóa App Check, mô hình Gemini, liên kết)

## Cây thư mục Google Drive = bộ khung của web
Thư mục gốc `PND - Phúc Nguyên Digital` (Drive của luuhuong.dhnv@gmail.com), tạo bằng nút **Khởi tạo cây thư mục**:
```
PND - Phúc Nguyên Digital / <Danh mục> / <Nhóm> / <Thẻ> / tệp…
```
- Danh mục cấp 1 cố định: Văn bản quy chế, Chương trình đào tạo, Đề cương học phần, Tài liệu giảng dạy, Nghiên cứu khoa học, Khoa học thể thao, Y học thường thức, Tài liệu khác, Chờ phân loại (chỉ quản trị thấy).
- Văn bản quy chế, CTĐT, Đề cương: trang danh mục hiện các **nhóm** (thư mục cấp 2) với **thẻ** bên dưới. Các danh mục khác hiện thẻ trực tiếp.
- Thẻ có năm trong tên được xếp theo năm, mới nhất trước; còn lại xếp ABC. Tệp trong bảng xếp theo ngày ban hành, mới nhất trước.
- Tệp hoặc thư mục đặt thẳng ở thư mục gốc (ngoài các danh mục) được đưa vào **Chờ phân loại**.

## Chức năng quản trị (đăng nhập Google bằng email trong `ADMIN_EMAILS`)
- **Quét Google Drive**: đọc lại toàn bộ cây, cập nhật chỉ mục Firestore. Không sửa, không di chuyển, không xóa tệp trên Drive. Thông tin đã nhập (cơ quan ban hành, hiệu lực…) được giữ.
- **Tải lên**: chọn danh mục và thư mục (có thể tạo thư mục con mới), tải tệp lên đúng thư mục Drive hoặc nhập đường link, điền ghi chú, đánh dấu ★ Thông dụng.
- **Sửa** ở từng dòng bảng tài liệu: thông tin ban hành, hiệu lực, ★.
- **Mở chia sẻ xem tài liệu**: đặt "Bất kỳ ai có đường liên kết đều xem được" cho các tệp đã xếp danh mục (cần để người dùng mã mở được tệp). Chỉ chạy khi quản trị bấm và xác nhận.
- **Quản lý mã tài khoản** (ô Dữ liệu): cấp mã, số người, hạn dùng, danh mục được xem; sửa, xóa — như mã lớp của PN Library.
- **Tìm kiếm**: theo tên và ghi chú; khi quản trị đã kết nối Drive thì tìm cả trong nội dung tệp.

## Người dùng mã tài khoản
Đăng nhập → tab Mã tài khoản → nhập mã. Xem được các danh mục mã cho phép, tới hết hạn mã. Mỗi trình duyệt tính một lượt.

## Hỏi AI
Gemini (Firebase AI Logic, Gemini Developer API — hạn mức miễn phí của dự án), bảo vệ bằng App Check (Fraud Defense/reCAPTCHA). Trợ lý trả lời dựa trên danh mục tài liệu người dùng được xem.

## Firestore
`pnd_settings` (root, thongdung) · `pnd_tree` · `pnd_items` · `pnd_ma/{mã}/luot/{uid}` · `pnd_users/{uid}` · `pnd_activity`.
Quy tắc: cây thư mục và cấu hình công khai; tài liệu chỉ đọc được khi mã còn hạn và có quyền danh mục; mọi ghi chỉ quản trị (trừ lượt dùng mã của chính người dùng).

## Google Cloud (dự án phuc-nguyen-library)
Drive API, Picker API bật; OAuth External/In production, phạm vi `drive` (hạn chế — Google hiện cảnh báo "ứng dụng chưa xác minh" khi quản trị đăng nhập: Nâng cao → Tiếp tục).

Bản trước khi chuyển: nhánh `backup-truoc-firebase-20261104`.
