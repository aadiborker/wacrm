import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // English-only. Locale switching / additional dictionaries were removed.
  const messages = (await import('../../messages/en.json')).default;

  return {
    locale: 'en',
    messages,
  };
});
