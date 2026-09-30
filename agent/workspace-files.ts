/**
 * Workspace file operations are object-native since the Blaxel/GCS
 * architecture (docs/plans/blaxel-sandbox-migration.md §5): the shared
 * implementation lives in lib/workspace-gcs.ts and is used by both the eve
 * agent runtime and the Next.js app. This module keeps the historical
 * agent-side import path working.
 */
export * from "../lib/workspace-gcs";
