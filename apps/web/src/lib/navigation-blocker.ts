export type NavigationBlocker = (continueNavigation: () => void) => boolean;

const blockers = new Set<NavigationBlocker>();

export function registerNavigationBlocker(blocker: NavigationBlocker): () => void {
  blockers.add(blocker);
  return () => blockers.delete(blocker);
}

export function blockNavigation(continueNavigation: () => void): boolean {
  for (const blocker of blockers) {
    if (blocker(continueNavigation)) return true;
  }
  return false;
}
