import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';

/**
 * Leave the current screen without assuming there is anywhere to go back to.
 *
 * `router.back()` only works when this screen was pushed onto a stack. A screen
 * can also be *entered directly* — a deep link, a notification tap, a Fast
 * Refresh that reloaded straight onto it — and then the history is empty and
 * `back()` dispatches a `GO_BACK` no navigator handles. In development that is
 * a console error; in production it is worse, because the button simply does
 * nothing and the user is stranded on the screen.
 *
 * So: go back when there is a back, otherwise replace with the screen this one
 * logically belongs under. `replace` rather than `push`, so the user does not
 * accumulate a history of screens they never chose to visit.
 */
export function useDismiss(fallback: Href): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  }, [router, fallback]);
}
