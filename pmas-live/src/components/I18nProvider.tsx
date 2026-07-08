import { useContext, createContext } from 'react';

interface I18nContext {
  locale: string;
}

const I18nContext = createContext<I18nContext>({ locale: 'en' });

export function I18nProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
