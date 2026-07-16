"use client";

import { useEffect, useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';

export function I18nWrapper({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    setLocale('en');
  }, []);

  return (
    <I18nProvider locale={locale}>
      {children}
    </I18nProvider>
  );
}
