import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // build ใช้ path แบบ relative → นำโฟลเดอร์ dist ไปวางที่ host ใต้ path ไหนก็ได้
  // (เช่น https://develophpg.net/hl-welfare/) โดยไม่ต้องแก้ค่าและไม่ต้องตั้งค่า server
  base: command === 'build' ? './' : '/',
  server: {
    port: 5173,
    // dev: /api ถูก proxy ไปที่ PHP built-in server (เฟส 2)
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
}));
