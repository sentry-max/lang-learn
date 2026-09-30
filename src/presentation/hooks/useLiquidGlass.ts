import { useSyncExternalStore } from "react";
import { isLiquidGlass, subscribeLiquidGlass } from "@presentation/appearance";

/** Whether the iPhone-style Liquid Glass look is on; re-renders when it's switched. */
export function useLiquidGlass(): boolean {
  return useSyncExternalStore(subscribeLiquidGlass, isLiquidGlass, () => false);
}
