/** Reading help is safe during a capture; changing rooms still uses its save guard. */
export function isLocalReilyHelp(target: Element): boolean {
  return Boolean(target.closest('[data-reily-local-help]')) && !target.closest('[data-reily-navigation]');
}
