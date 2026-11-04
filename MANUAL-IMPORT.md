# Nhập dữ liệu thủ công – Phúc Nguyên Digital

## Cách sử dụng
1. Mở website và đến mục **Nhập tài liệu thủ công**.
2. Nhập tên tài liệu (bắt buộc), nhóm công việc, phân nhóm, loại tài liệu, năm/ngày ban hành, số/ký hiệu, URL, quyền truy cập và mô tả.
3. Nhấn **Lưu tài liệu**. Bản ghi được lưu trong localStorage của trình duyệt đang sử dụng.
4. Nhấn **Xuất JSON** để sao lưu hoặc chuyển dữ liệu sang kho công khai.
5. Để công khai cho mọi người dùng, cập nhật mảng `documents` trong `data/documents.json` bằng dữ liệu JSON đã xuất rồi commit lên GitHub.

## Phân nhóm CTĐT
Khi chọn nhóm **Chương trình đào tạo**, chọn một trong hai phân nhóm:
- `CTĐT ban hành (2016 đến nay)`: chương trình chính thức đã ban hành, cần quản lý theo năm và phiên bản.
- `Hồ sơ có liên quan`: tờ trình, biên bản, báo cáo rà soát, quyết định thành lập hội đồng, minh chứng, góp ý và tài liệu phục vụ xây dựng/điều chỉnh CTĐT.

Hồ sơ có liên quan nên ghi rõ năm, số/ký hiệu và mô tả phiên bản CTĐT liên quan.

## Lưu ý về dữ liệu và bảo mật
- Dữ liệu lưu trên trình duyệt không tự đồng bộ giữa máy tính hoặc người dùng.
- `data/documents.json` là danh mục công khai, không đưa URL/tên tài liệu nội bộ hoặc tài liệu hạn chế truy cập vào đây.
- Trường quyền truy cập hiện là nhãn phân loại nghiệp vụ, chưa phải cơ chế bảo vệ tài liệu ở phía máy chủ. Không dùng nó để bảo vệ tài liệu nhạy cảm.
- Đường dẫn Drive chỉ mở được với người đã được Drive cấp quyền tương ứng.
- Không xóa dữ liệu nguồn Drive khi nhập thủ công.
