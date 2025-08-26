// Human-friendly labels for business unit codes and helpers

export const UNIT_LABELS: Record<string, string> = {
  // Known examples — extend as needed
  Z001: 'Liferafts',
  // Z002: '…',
  // Z003: '…',
};

/**
 * Returns a human-friendly label for a BU code if known; otherwise returns the code itself.
 */
export function unitLabel(id: string | null | undefined): string {
  const key = String(id ?? '').toUpperCase().trim();
  if (!key) return '';
  return UNIT_LABELS[key] || key;
}
