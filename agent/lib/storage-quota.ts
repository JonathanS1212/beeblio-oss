/**
 * Storage quota moved into the shared GCS workspace layer
 * (lib/workspace-gcs.ts) now that usage is the summed object size under
 * gs://<bucket>/<userId>/ instead of a host-directory walk. This module
 * keeps the historical agent-side import path working.
 */
export {
  assertStorageQuota,
  getUserStorageUsage,
  getWorkspaceStorageUsage,
  invalidateUserStorageCache,
  type StorageUsage,
} from "../../lib/workspace-gcs";
