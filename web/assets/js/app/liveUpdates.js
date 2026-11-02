// อัปเดตเมื่อมีข้อมูลใหม่ (หน้าภาพรวม) — jQuery long-polling ไม่ใช้ตัวจับเวลา (setTimeout / setInterval)
//   ส่ง GET /monitor/changes?since=เวอร์ชัน → เซิร์ฟเวอร์ค้างคำขอไว้จนมีการเปลี่ยนแปลง (หรือครบ 25 วิ) แล้วตอบ
//   ได้คำตอบ = ส่งคำขอถัดไปทันที · มีการเปลี่ยนแปลง = onChange() (หน้าวาดใหม่เฉพาะส่วน ไม่โหลดทั้งหน้า)
//   แท็บซ่อน = เลิกรอ · กลับมาที่แท็บ = ถามต่อจากเวอร์ชันเดิม (มีอะไรเปลี่ยนระหว่างนั้นจะตอบทันที)
//   เชื่อมต่อไม่ได้ = หยุด แล้วลองใหม่เมื่อเน็ตกลับมา (online) / กลับมาที่แท็บ / resume() (ปุ่มรีเฟรช)
//   โหมด mock / ฝึก: ไม่มีเซิร์ฟเวอร์ → ฟังข้อมูลจำลองที่แท็บอื่นแก้ (storage event)
// เวอร์ชัน = id ล่าสุดของ audit_log (backend/api/handlers.php api_monitor_changes)
import { CONFIG } from '../config.js';
import { API_MODE, PRACTICE, sessionAuth } from './api.js';

const JQUERY = 'assets/vendor/jquery/jquery.min.js';
let loading = null;
function loadJquery() {
  loading ??= window.jQuery
    ? Promise.resolve(window.jQuery)
    : new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = JQUERY;
        s.onload = () => resolve(window.jQuery);
        s.onerror = () => {
          loading = null;
          reject(new Error('โหลด jQuery ไม่สำเร็จ'));
        };
        document.head.append(s);
      });
  return loading;
}

/**
 * @param {() => any} onChange  มีข้อมูลใหม่
 * @param {(status: 'live' | 'offline') => void} [onStatus]  live = กำลังรอข้อมูลใหม่ · offline = เชื่อมต่อไม่ได้
 * @returns {{ resume: () => void }}  resume = ลองเชื่อมต่อใหม่ (ถ้าหยุดอยู่)
 */
export function watchChanges(onChange, onStatus = () => {}) {
  if (API_MODE !== 'http' || PRACTICE) {
    window.addEventListener('storage', (e) => e.key?.startsWith('hl-welfare-') && onChange());
    onStatus('live');
    return { resume() {} };
  }

  const url = `${CONFIG.apiBaseUrl.replace(/\/$/, '')}/monitor/changes`;
  let version = null;
  let xhr = null;

  const offline = () => {
    xhr = null;
    onStatus('offline');
  };

  async function poll() {
    if (xhr || document.hidden) return;
    xhr = true; // จองไว้ระหว่างโหลด jQuery
    let $;
    try {
      $ = await loadJquery();
    } catch {
      return offline();
    }
    onStatus('live');
    xhr = $.ajax({
      url,
      data: version === null ? {} : { since: version, wait: 25 },
      dataType: 'json',
      cache: false,
      timeout: 40_000,
      xhrFields: { withCredentials: true },
    });
    xhr.then(
      (body) => {
        xhr = null;
        const d = body?.data;
        if (!d) return offline(); // คำตอบแปลก — หยุด ไม่วนถามรัว ๆ
        if (d.changed) onChange();
        version = d.version;
        poll();
      },
      (x, status) => {
        if (status === 'abort') return void (xhr = null); // แท็บซ่อน — กลับมาค่อยถามต่อ
        if (x.status === 401 && sessionAuth) {
          xhr = null;
          // session หมดอายุ → ต่ออายุครั้งเดียวแล้วถามต่อ · ไม่ได้ = ไปหน้า login
          return sessionAuth.tryRefresh().then((ok) => (ok ? poll() : sessionAuth.onUnauthorized()), offline);
        }
        offline();
      },
    );
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) xhr?.abort?.();
    else poll();
  });
  window.addEventListener('online', poll);
  poll();
  return { resume: poll };
}
