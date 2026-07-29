const { test, expect } = require('@playwright/test');

const landingUrl = process.env.QA_LANDING_URL || process.env.QA_WWW_URL || 'https://menorah.me';

async function loadLanding(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const response = await page.goto(landingUrl, { waitUntil: 'domcontentloaded' });
  expect(response, 'landing page should return an HTTP response').toBeTruthy();
  expect(response.status(), 'landing page should not return an error').toBeLessThan(400);
  await expect(page.locator('[data-product-dashboard]')).toBeAttached({ timeout: 15_000 });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
}

async function scrollWithinSection(page, selector, progress) {
  await page.locator(selector).waitFor();
  await page.evaluate(
    ({ sectionSelector, sectionProgress }) => {
      const section = document.querySelector(sectionSelector);
      if (!section) {
        throw new Error(`Missing landing section: ${sectionSelector}`);
      }

      const rect = section.getBoundingClientRect();
      const absoluteTop = window.scrollY + rect.top;
      const travel = Math.max(section.clientHeight - window.innerHeight, 0);
      window.scrollTo({ top: absoluteTop + travel * sectionProgress, behavior: 'instant' });
    },
    { sectionSelector: selector, sectionProgress: progress }
  );
}

async function getDashboardState(page) {
  return page.locator('[data-product-dashboard]').evaluate((element) => {
    const style = getComputedStyle(element);
    return { opacity: Number(style.opacity), transform: style.transform };
  });
}

test.describe('landing scroll animations', () => {
  test('the hero dashboard and support phone advance while scrolling', async ({ page }) => {
    await loadLanding(page);
    const initialDashboard = await getDashboardState(page);

    await scrollWithinSection(page, '[data-menorah-home-ready]', 0.65);
    await expect.poll(async () => (await getDashboardState(page)).opacity).toBeGreaterThan(0.95);
    const progressedDashboard = await getDashboardState(page);
    expect(progressedDashboard.transform).not.toBe(initialDashboard.transform);

    await scrollWithinSection(page, '#support-pathway', 0.65);
    const phone = page.locator('[data-menorah-phone-mockup="support-pathway"]');
    await expect.poll(async () => Number(await phone.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0.95);
    await expect(phone).toHaveAttribute('aria-label', /Menorah app example: (?!Discover)/);
  });

  test('the landing still scrolls when observer APIs are unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: undefined });
      Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined });

      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const media = nativeMatchMedia(query);
        return {
          matches: media.matches,
          media: media.media,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        };
      };
    });

    await loadLanding(page);
    await scrollWithinSection(page, '[data-menorah-home-ready]', 0.65);
    await expect.poll(async () => (await getDashboardState(page)).opacity).toBeGreaterThan(0.95);
  });
});
