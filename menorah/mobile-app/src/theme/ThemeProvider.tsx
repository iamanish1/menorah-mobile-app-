import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import type { Scheme } from './colors';

type Ctx = {
  scheme: Scheme;
  setScheme: (s: Scheme) => void;
  toggle: () => void;
};

const ThemeCtx = createContext<Ctx>({ scheme: 'light', setScheme: () => {}, toggle: () => {} });

export const useThemeMode = () => useContext(ThemeCtx);

async function tryLoad(): Promise<Scheme | null> {
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const v = await mod.default.getItem('MENORAH_THEME');
    return v === 'dark' || v === 'light' ? (v as Scheme) : null;
  } catch {
    return null;
  }
}
async function trySave(s: Scheme) {
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    await mod.default.setItem('MENORAH_THEME', s);
  } catch {}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = (useSystemScheme() ?? 'light') as Scheme;
  const [override, setOverride] = useState<Scheme | null>(null);

  useEffect(() => {
    (async () => {
      const v = await tryLoad();
      if (v) setOverride(v);
    })();
  }, []);

  const scheme: Scheme = override ?? sys;

  const value = useMemo<Ctx>(
    () => ({
      scheme,
      setScheme: (s) => {
        setOverride(s);
        trySave(s);
      },
      toggle: () => {
        const s = scheme === 'light' ? 'dark' : 'light';
        setOverride(s);
        trySave(s);
      },
    }),
    [scheme]
  );

  // Simple theme context without NativeWind wrapper
  return (
    <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
  );
}
