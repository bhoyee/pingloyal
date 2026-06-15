// A trigger type is enabled unless the tenant has explicitly disabled it.
export function isTriggerEnabled(
  enabledTriggers: Record<string, boolean> | null | undefined,
  type: string,
): boolean {
  return enabledTriggers?.[type] !== false;
}
