declare module "d3-dsv" {
  export type DSVRowArray<T> = T[] & { columns: string[] };
  export function csvParse(source: string): DSVRowArray<Record<string, string>>;
}
