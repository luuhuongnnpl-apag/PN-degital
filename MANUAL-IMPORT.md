# Nhập dữ liệu thủ công – Phúc Nguyên Digital

## Cách sử dụng
1. Mở website và đến mục **Nhập tài liệu thủ công**.
2. Nhập tên tài liệu (bắt buộc), nhóm công việc, phân nhóm, loại tài liệu, năm/ngày ban hành, số/ký hiệu, URL, quyền truy cập và mô tả.
3. Nhấn **Lưu tài liệu** (cần đăng nhập Google bằng tài khoản quản trị). Bản ghi lưu lên Firebase và đồng bộ trên mọi máy.
4. Mục để **Công khai** thì mọi người xem được ngay; **Có điều kiện truy cập** và **Nội bộ** chỉ quản trị viên thấy.
5. Nhấn **Xuất JSON** để tải bản sao lưu về máy.

## Phân nhóm CTĐT
Khi chọn nhóm **Chương trình đào tạo**, chọn một trong hai phân nhóm:
- `CTĐT ban hành (2016 đến nay)`: chương trình chính thức đã ban hành, cần quản lý theo năm và phiên bản.
- `Hồ sơ có liên quan`: tờ trình, biên bản, báo cáo rà soát, quyết định thành lập hội đồng, minh chứng, góp ý và tài liệu phục vụ xây dựng/điều chỉnh CTĐT.

Hồ sơ có liên quan nên ghi rõ năm, số/ký hiệu và mô tả phiên bản CTĐT liên quan.

## Lưu ý về dữ liệu và bảo mật
- Dữ liệu lưu trên Firebase (Firestore `pnd_catalog`), tự đồng bộ giữa các máy.
- `data/documents.json` là danh mục công khai, không đưa URL/tên tài liệu nội bộ hoặc tài liệu hạn chế truy cập vào đây.
- Trường quyền truy cập hiện là nhãn phân loại nghiệp vụ, chưa phải cơ chế bảo vệ tài liệu ở phía máy chủ. Không dùng nó để bảo vệ tài liệu nhạy cảm.
- Đường dẫn Drive chỉ mở được với người đã được Drive cấp quyền tương ứng.
- Không xóa dữ liệu nguồn Drive khi nhập thủ công.
