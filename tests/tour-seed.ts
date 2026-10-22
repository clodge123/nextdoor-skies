// W3-E2 TOUR — shared e2e helper: mark the tour as seen so a spec drives the
// app as a RETURNING visitor. The first-visit tour is a real overlay (scrim
// captures clicks); every non-tour spec seeds 'nds-tour-seen' via an init
// script BEFORE the first goto, exactly like a second visit in the wild.
// (tour.spec.ts is the only spec that leaves the flag unset — first visit.)
import type { Page } from '@playwright/test';

export async function markTourSeen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nds-tour-seen', '1');
    } catch {
      /* private mode: tour shows every visit — specs tolerate it */
    }
  });
}
