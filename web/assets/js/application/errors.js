/** error ที่ทุก adapter โยนออกมาเหมือนกัน → หน้าจอจัดการแบบเดียว */
export class ApiError extends Error {
  status;
  /** @type {Record<string,string>|undefined} ข้อความแยกตามช่อง (422) */
  details;
  constructor(message, status = 400, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function errorMessage(e) {
  if (e instanceof Error) return e.message;
  return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}
