export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'handback-theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function setThemePref(pref: ThemePref) {
  applyTheme(pref);
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent('handback-theme', { detail: pref }));
}

export function isDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr) return attr === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
