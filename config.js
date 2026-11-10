// Cấu hình công khai của Phúc Nguyên Digital — không chứa mật khẩu hay client secret.
// Quyền đọc/ghi do Quy tắc bảo mật Firestore quyết định.
window.PND_CONFIG = {
  FIREBASE: {
    apiKey: "AIzaSyCIYY-dzhJ4rUYsXvBQivIxcziUC3hR1-U",
    authDomain: "phuc-nguyen-library.firebaseapp.com",
    projectId: "phuc-nguyen-library",
    storageBucket: "phuc-nguyen-library.firebasestorage.app",
    messagingSenderId: "842652271567",
    appId: "1:842652271567:web:e1e23a9d3a0f21d07988ba"
  },
  // OAuth client web của dự án — dùng để gia hạn quyền Drive ngầm, không phải đăng nhập lại
  CLIENT_ID: "842652271567-7d5orqj763rlrsiu2kq4ne0170fp9dsr.apps.googleusercontent.com",
  // Khóa công khai đọc thư mục Drive đã chia sẻ "Bất kỳ ai có đường liên kết" (chỉ dùng được trên luuhuongnnpl-apag.github.io)
  DRIVE_KEY: "AIzaSyBxay5pqncjdoJ6EEfpAMRNfzj7MunHx3c",
  // Tài khoản quản trị chung của hệ sinh thái PN (email/mật khẩu)
  ADMIN_UID: "smoIpuX7qseqTeu9nToc9RYigku1",
  // Tài khoản Google quản trị (đăng nhập Google để quét Drive, tải lên, cấp mã)
  ADMIN_EMAILS: ["luuhuong.dhnv@gmail.com", "luuhuong.nnpl@gmail.com"],
  // Tài khoản Google sở hữu thư mục PND trên Drive: quản trị viên thao tác Drive (đổi tên, chuyển, tải lên…) bằng tài khoản này
  DRIVE_OWNER: "luuhuong.dhnv@gmail.com",
  // Khóa reCAPTCHA (Fraud Defense) công khai cho App Check — bảo vệ Hỏi AI khỏi bị lạm dụng
  APPCHECK_SITE_KEY: "6LdANxAuAAAAAKIjvQ50BAohlCrqbEb_YHFQzOag",
  // Mô hình Gemini dùng cho Hỏi AI
  AI_MODEL: "gemini-2.5-flash",
  LINKS: {
    pnl: "https://luuhuongnnpl-apag.github.io/phuc-nguyen-library/",
    pnw: "https://luuhuongnnpl-apag.github.io/Phuc-nguyen-work/",
    drive: "https://drive.google.com/drive/my-drive",
    gmail: "https://mail.google.com/mail/"
  }
};
