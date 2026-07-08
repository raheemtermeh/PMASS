import { NextIntlProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { getMessages } from '@/lib/i18n/getMessages';

type Locale = 'en' | 'fa';

export default async function NextIntlClientProvider({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: Locale };
}) {
  if (!['en', 'fa'].includes(params.locale)) {
    notFound();
  }

  const messages = await getMessages(params.locale);

  return (
    <NextIntlProvider
      locale={params.locale}
      messages={messages}
      timeZone="Asia/Tehran"
      now={new Date()}
    >
      {children}
    </NextIntlProvider>
  );
}
