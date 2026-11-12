import { useEffect, useState } from 'react';
import { isDark, setThemePref } from '../lib/theme';
import { IconMoon, IconSun } from './icons';

export function ThemeToggle() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const on = () => setDark(isDark());
    window.addEventListener('handback-theme', on);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', on);
    return () => {
      window.removeEventListener('handback-theme', on);
      mq?.removeEventListener?.('change', on);
    };
  }, []);
  return (
    <button className="icon-btn" onClick={() => setThemePref(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}
