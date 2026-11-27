import { test as base } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.addInitScript(() => localStorage.setItem('wave-welcome-done', 'true'));
    await provide(context);
  },
});
export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';
