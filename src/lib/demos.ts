import type { ManualRecord } from "./spec/types";
import billy from "../data/demo-billy.json";

/**
 * Built-in examples: real output of the reader on public manuals, stored as-is
 * (nothing hand-edited), so the site shows what an upload actually produces.
 */
export const DEMOS: Record<string, ManualRecord> = {
  billy: billy as unknown as ManualRecord,
};
