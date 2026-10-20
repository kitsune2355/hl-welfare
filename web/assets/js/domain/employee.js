// กฎข้อมูลพนักงานที่คำนวณได้เอง (ฝั่ง PHP: backend/domain/date.php — probation_due_date)
import { addDays, ageAt } from './date.js';

/** ทดลองงาน 119 วัน — วันผ่านทดลองงาน = วันเริ่มงาน + 119 วัน */
export const PROBATION_DAYS = 119;

/** วันผ่านทดลองงานที่คำนวณจากวันเริ่มงาน (ไม่มีวันเริ่มงาน = null) */
export const probationDueDate = (startDate) => (startDate ? addDays(startDate, PROBATION_DAYS) : null);

/** อายุเต็มปี ณ วันที่ today (ไม่มีวันเกิด = null) */
export const ageOf = (birthDate, today) => (birthDate ? ageAt(birthDate, today) : null);
