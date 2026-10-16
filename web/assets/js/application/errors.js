/** error ที่ทุก adapter โยนออกมาเหมือนกัน → หน้าจอจัดการแบบเดียว */
export class ApiError extends Error {
  status;
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function errorMessage(e) {
  if (e instanceof Error) return e.message;
  return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}
