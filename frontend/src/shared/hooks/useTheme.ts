import { useCallback, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'hl-theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);

  const set = useCallback((p: ThemePref) => {
    setPref(p);
    const root = document.documentElement;
    if (p === 'system') delete root.dataset.theme;
    else root.dataset.theme = p;
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  const isDark =
    pref === 'dark' || (pref === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);

  return { pref, isDark, set, toggle: () => set(isDark ? 'light' : 'dark') };
}
