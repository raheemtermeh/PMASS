"use client";

import { useMemo } from 'react';
import { getLocale } from '@/lib/i18n/getLocale';

type Locale = 'en' | 'fa';

export function useLocale() {
  return useMemo(() => getLocale(), []);
}

export function useMessages() {
  const locale = useLocale();
  return useMemo(() => {
    return (window as any).__messages || {};
  }, [locale]);
}

export function useCurrentLocale() {
  return 'en' as Locale;
}
