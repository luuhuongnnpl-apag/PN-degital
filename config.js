// Định danh công khai — không chứa client secret hay mật khẩu.
// Đăng nhập Google qua Firebase Auth (một lần cho cả Drive và danh mục); quyền đọc/ghi do Quy tắc bảo mật Firestore quyết định.
window.PND_CONFIG={
  // Khóa Google Picker (chỉ dùng được trên https://luuhuongnnpl-apag.github.io/*)
  API_KEY:"AIzaSyATjaDQsREAE_Uk3jDBxUAfkWCxhVhFvFI",
  // Số hiệu dự án Google Cloud — cần cho Picker cấp quyền drive.file
  APP_ID:"842652271567",
  // OAuth client web của dự án (tham chiếu; đăng nhập đi qua Firebase Auth)
  CLIENT_ID:"842652271567-7d5orqj763rlrsiu2kq4ne0170fp9dsr.apps.googleusercontent.com",
  // Tài khoản Google được quyền quản trị danh mục
  ADMIN_EMAILS:["luuhuong.nnpl@gmail.com","luuhuong.dhnv@gmail.com"],
  FIREBASE:{
    apiKey:"AIzaSyCIYY-dzhJ4rUYsXvBQivIxcziUC3hR1-U",
    authDomain:"phuc-nguyen-library.firebaseapp.com",
    projectId:"phuc-nguyen-library",
    storageBucket:"phuc-nguyen-library.firebasestorage.app",
    messagingSenderId:"842652271567",
    appId:"1:842652271567:web:e1e23a9d3a0f21d07988ba"
  }
};
