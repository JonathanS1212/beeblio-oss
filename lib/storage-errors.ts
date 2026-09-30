/**
 * The agent rejects quota-exceeding writes with a friendly message (code
 * `storage_quota_exceeded`); server actions surface only the message text.
 * This matcher lets upload surfaces distinguish "workspace full" from other
 * failures without plumbing error codes through every action.
 */
export function isStorageLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /storage quota exceeded|workspace is full|storage limit reached/i.test(message);
}
