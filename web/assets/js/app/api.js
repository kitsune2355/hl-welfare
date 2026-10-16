// จุดเดียวที่เลือกแหล่งข้อมูล — ทุกหน้า import { api } จากไฟล์นี้
// (หน้าจอห้าม import MockApi/HttpApi ตรง ๆ เพื่อให้สลับ mock ↔ PHP ได้โดยไม่แก้หน้าจอ)
import { CONFIG } from '../config.js';
import { HttpApi } from '../infrastructure/http/httpApi.js';
import { MockApi } from '../infrastructure/mock/mockApi.js';

export const API_MODE = CONFIG.apiMode === 'http' ? 'http' : 'mock';

/** @type {import('../application/ports.js').WelfareApi} */
export const api = API_MODE === 'http' ? new HttpApi(CONFIG.apiBaseUrl) : new MockApi();
