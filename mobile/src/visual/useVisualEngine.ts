import { useSyncExternalStore } from "react";
import { visualEngine } from "./VisualEngine";
import type { VisualSnapshot } from "../types";

export function useVisualSnapshot(): VisualSnapshot {
  return useSyncExternalStore(visualEngine.subscribe, visualEngine.getSnapshot, visualEngine.getSnapshot);
}

export { visualEngine };
