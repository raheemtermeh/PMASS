import { notFound } from 'next/navigation';

type Locale = 'en' | 'fa';

export async function getMessages(locale: Locale) {
  try {
    return (await import(`@/messages/${locale}.json`)).default;
  } catch {
    return (await import('@/messages/en.json')).default;
  }
}
