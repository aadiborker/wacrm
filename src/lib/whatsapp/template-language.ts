/**
 * Meta WhatsApp template language codes.
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/supported-languages
 *
 * Some UI presets use locale-style codes (kn_IN) that Meta does not accept —
 * map them to the official code before create/submit.
 */
export const META_TEMPLATE_LANGUAGE_ALIASES: Record<string, string> = {
  kn_IN: 'kn',
  kn: 'kn',
  hi_IN: 'hi',
  hi: 'hi',
}

export function normalizeMetaTemplateLanguage(language: string): string {
  const trimmed = language.trim()
  if (!trimmed) return trimmed
  const alias = META_TEMPLATE_LANGUAGE_ALIASES[trimmed]
  if (alias) return alias
  return trimmed
}
