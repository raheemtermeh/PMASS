import { notFound } from 'next/navigation';

type Locale = 'en' | 'fa';

export async function getLocale() {
  const acceptLanguage = 'fa,en';
  const preferredLocale = acceptLanguage.split(',')[0] as Locale;
  
  if (!['en', 'fa'].includes(preferredLocale)) {
    notFound();
  }

  return preferredLocale;
}
