'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import styles from './ThemeToggle.module.css';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'menorah-theme';
const THEME_CHANGE_EVENT = 'menorah-theme-change';

const getStoredTheme = (): ThemeMode | null => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
};

const getSystemTheme = (): ThemeMode =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const getDocumentTheme = (): ThemeMode =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light';

const setDocumentTheme = (theme: ThemeMode) => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
};

const applyTheme = (theme: ThemeMode, persist = true) => {
  setDocumentTheme(theme);

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }

  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: theme }));
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    const syncTheme = () => setTheme(getDocumentTheme());
    const syncFromStorage = () => {
      const nextTheme = getStoredTheme() ?? getSystemTheme();
      setDocumentTheme(nextTheme);
      setTheme(nextTheme);
    };

    syncTheme();

    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail;
      setTheme(nextTheme === 'dark' || nextTheme === 'light' ? nextTheme : getDocumentTheme());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        syncFromStorage();
      }
    };

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        applyTheme(event.matches ? 'dark' : 'light', false);
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener('storage', handleStorage);
    media.addEventListener('change', handleSystemThemeChange);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleStorage);
      media.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  const dark = theme === 'dark';

  const toggle = () => {
    const nextTheme: ThemeMode = dark ? 'light' : 'dark';
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={styles.toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
