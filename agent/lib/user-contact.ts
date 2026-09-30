/** Optional contact address for polite public research API requests. */
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function getUserContactEmail(_principalId: string | undefined): Promise<string | null> {
  const email = process.env.CROSSREF_MAILTO?.trim() || "";
  return emailPattern.test(email) ? email : null;
}
