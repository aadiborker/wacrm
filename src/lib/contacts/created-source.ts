/** How a contact row was created (contacts.created_source). */
export const CONTACT_CREATED_SOURCES = [
  "manual",
  "import",
  "whatsapp",
  "api",
  "broadcast",
] as const;

export type ContactCreatedSource = (typeof CONTACT_CREATED_SOURCES)[number];

export function isContactCreatedSource(
  value: unknown,
): value is ContactCreatedSource {
  return (
    typeof value === "string" &&
    (CONTACT_CREATED_SOURCES as readonly string[]).includes(value)
  );
}
