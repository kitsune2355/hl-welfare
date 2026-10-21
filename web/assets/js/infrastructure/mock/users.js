// ผู้ใช้จำลองสำหรับโหมด mock (เฟส 1) — เฟส 2 ใช้ตาราง users ใน MySQL (รหัสผ่านเก็บเป็น hash)
// ⚠️ ไฟล์นี้ถูกส่งถึงเบราว์เซอร์ อย่าใส่รหัสผ่านจริง
export const MOCK_USERS = [
  { username: 'hr', password: 'hr1234', name: 'สมใจ ใจดี', role: 'HR Admin' },
  { username: 'payroll', password: 'payroll1234', name: 'วิชัย บัญชีดี', role: 'Payroll' },
];
