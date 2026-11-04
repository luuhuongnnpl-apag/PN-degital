# PN Digital – Google Drive integration (pilot)

## Mục tiêu

Tạo bộ lập chỉ mục thử nghiệm cho **CTĐT ngành Luật** bằng Google Apps Script, không cần Cloudflare. Các tệp nguồn trong Drive không bị đổi tên, di chuyển, sửa nội dung hoặc xóa.

## Thành phần

- `Code.gs`: quét metadata Drive, phân loại sơ bộ và ghi JSON chỉ mục.
- `Admin.html`: giao diện quản trị tối giản để chạy quét.
- `appsscript.json`: cấu hình runtime và OAuth scopes.

## Cài đặt một lần (cần chủ tài khoản Google xác nhận)

1. Mở https://script.google.com/home/start và tạo dự án mới tên **PN Digital Drive Indexer**.
2. Trong trình soạn thảo, thay nội dung `Code.gs` bằng tệp cùng tên trong thư mục này.
3. Tạo HTML file tên chính xác `Admin` (không thêm đuôi), dán nội dung từ `Admin.html`.
4. Mở Project Settings, bật **Show "appsscript.json" manifest file in editor**; thay manifest bằng nội dung trong repository.
5. Chọn hàm `scanLawCurriculum` và nhấn Run. Google sẽ hiển thị màn hình xin quyền; chủ tài khoản xem xét và chấp thuận.
6. Sau khi chạy thử thành công, chọn **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Only myself**
   - Deploy, sau đó mở URL Web app khi đang đăng nhập đúng tài khoản Google.

Không chọn quyền truy cập công khai/Anyone trong giai đoạn thử nghiệm. Giao diện web app chỉ dành cho quản trị viên.

## Kết quả

Script tạo thư mục `PN Digital - Index` trong Drive và tệp `ctdt-nganh-luat-index.json`. Đây là bản chỉ mục metadata, không sao chép tài liệu nguồn.

## Giới hạn và bảo vệ dữ liệu

- Quét tối đa 5.000 tệp mỗi lần chạy; nếu chạm giới hạn, kết quả báo `truncated=true`.
- Bản thử nghiệm chỉ dựa trên tên tệp và tên thư mục; chưa đọc nội dung tài liệu.
- Ảnh, video và các tên/thư mục có từ khóa cá nhân, gia đình hoặc giấy tờ nhạy cảm bị loại trừ.
- Bộ lọc từ khóa không thể bảo đảm nhận diện mọi tài liệu riêng tư. Vì vậy JSON chỉ mục là dữ liệu nội bộ; cần kiểm tra danh sách trước khi đưa lên website.
- Phân loại CTĐT ban hành/hồ sơ xây dựng là gợi ý tự động, không phải kết luận pháp lý. Cần đối chiếu quyết định ban hành và nội dung hồ sơ.
- Chưa bật API công khai cho GitHub Pages. Không đặt OAuth token, API key hoặc dữ liệu chỉ mục riêng tư trong repository công khai.

## Phát triển tiếp theo

Sau khi người quản trị xác nhận quét đúng và an toàn, có thể bổ sung đồng bộ có kiểm soát sang PN Digital, phân quyền người dùng và tải tài liệu. Không công khai endpoint hoặc dữ liệu Drive trước khi hoàn thiện xác thực server-side.
