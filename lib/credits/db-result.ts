export function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result)) return result[0] as T | undefined;
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown[] }).rows;
    return rows?.[0] as T | undefined;
  }
  return undefined;
}

