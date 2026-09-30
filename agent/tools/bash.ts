import { disableTool } from "eve/tools";

// Keep this authored slot so Eve does not restore its default sandbox-backed
// bash tool. Research computation runs through the Batch-only run_analysis tool.
export default disableTool();
