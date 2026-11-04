# PN Digital – Google Drive integration (pilot)

## Mục tiêu
Tìm kiếm thử nghiệm tài liệu **CTĐT ngành Luật** trong Google Drive bằng Google Apps Script. Tệp nguồn không bị đổi tên, di chuyển, sửa nội dung hoặc xóa.

## Thành phần
- `Code.gs`: tìm kiếm có điều kiện và đọc metadata.
- `Admin.html`: giao diện chạy tìm kiếm và xem danh sách gợi ý.
- `appsscript.json`: chỉ yêu cầu quyền đọc Drive và email tài khoản.

## Cập nhật mã trong Apps Script
1. Mở dự án **PN Digital Drive Indexer**.
2. Thay toàn bộ nội dung `Code.gs` bằng tệp `Code.gs` trong thư mục này.
3. Thay toàn bộ nội dung HTML file `Admin` bằng `Admin.html`.
4. Thay manifest `appsscript.json` bằng tệp cùng tên.
5. Lưu dự án. Chọn `scanLawCurriculum` và chạy lại; Google có thể yêu cầu xác nhận lại quyền chỉ đọc.

## Cách hoạt động và giới hạn
- Tìm ứng viên theo tên tệp và nội dung được Google Drive lập chỉ mục với các cụm “CTĐT”/“chương trình đào tạo”; giới hạn 800 ứng viên mỗi lượt.
- Chỉ hiển thị tối đa 150 kết quả xem trước trong giao diện.
- Ảnh, video và một số tên tệp có từ khóa cá nhân/nhạy cảm bị loại trừ. Đây là bộ lọc thận trọng nhưng không thể bảo đảm phát hiện mọi tài liệu riêng tư.
- Phân loại theo tên tệp chỉ là gợi ý; cần kiểm tra thủ công quyết định ban hành và nội dung hồ sơ.
- Đây là tìm kiếm có điều kiện, không phải kiểm kê đầy đủ toàn bộ Drive. Thư mục cha không được truy vấn để tránh làm chậm.
- Mã không tạo thư mục/tệp chỉ mục và không ghi dữ liệu vào Drive.

## Bảo vệ dữ liệu
Không công khai kết quả tìm kiếm, URL tài liệu hoặc endpoint ra GitHub Pages. Chỉ triển khai Web App ở chế độ **Only myself** trong giai đoạn thử nghiệm. Không đưa OAuth token, API key hoặc dữ liệu Drive vào repository.
