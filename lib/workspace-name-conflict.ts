export function nameConflictMessage(name: string) {
  return `A file named "${name}" already exists in this folder.`;
}

export function destinationNameTaken(
  entries: Array<{ name: string; path: string }>,
  destinationName: string,
  ignorePath?: string,
) {
  return entries.some(
    (entry) =>
      entry.name === destinationName &&
      (!ignorePath || entry.path !== ignorePath),
  );
}
