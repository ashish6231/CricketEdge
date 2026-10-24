export const GMAIL_REQUIRED_MESSAGE = 'Please use a valid @gmail.com email address to create an account.';

// A domain suffix check alone would accept empty usernames or additional @ signs.
// Preserve dots and plus tags; they remain part of the stored account address.
export function normalizeGmailEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  const local = email.split('@')[0];
  if (local.length > 64 || !/^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[a-z0-9._-]+)?@gmail\.com$/.test(email)) return null;
  return email;
}
