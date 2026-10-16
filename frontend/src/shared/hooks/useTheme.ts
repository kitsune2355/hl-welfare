import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'hl-theme';

/** ค่าเริ่มต้นเป็นโทนสว่างเสมอ — โหมดมืดเปิดเมื่อผู้ใช้กดเลือกเท่านั้น */
function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);

  const set = useCallback((t: Theme) => {
    setTheme(t);
    const root = document.documentElement;
    if (t === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    try {
      if (t === 'dark') localStorage.setItem(KEY, 'dark');
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const isDark = theme === 'dark';
  return { theme, isDark, set, toggle: () => set(isDark ? 'light' : 'dark') };
}
