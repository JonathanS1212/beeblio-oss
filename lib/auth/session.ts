/** The local edition has one owner and no browser login. */
export const localUser = {
  id: "local",
  name: "Local User",
  email: "local@beeblio.invalid",
  image: null,
} as const;

export async function getUser() {
  return localUser;
}

export async function requireUser() {
  return localUser;
}
