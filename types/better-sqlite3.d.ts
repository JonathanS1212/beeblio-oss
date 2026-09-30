declare module "better-sqlite3" {
  const Database: new (path: string) => {
    pragma(source: string): void;
  };
  export default Database;
}
