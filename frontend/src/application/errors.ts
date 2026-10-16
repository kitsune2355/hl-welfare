/** error ที่ทุก adapter โยนออกมาเหมือนกัน → หน้าจอจัดการแบบเดียว */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}
