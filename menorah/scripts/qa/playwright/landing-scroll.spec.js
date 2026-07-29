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
  // The client auth shell briefly swaps during hydration. Wait for the final
  // landing layout before calculating section scroll offsets.
  await page.waitForTimeout(800);
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
      window.scrollTo(0, absoluteTop + travel * sectionProgress);
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

async function getStickyViewportState(page, name) {
  return page.locator(`[data-landing-scroll-viewport="${name}"]`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      position: getComputedStyle(element).position,
      top: rect.top,
      viewportHeight: window.innerHeight,
    };
  });
}

async function expectStickyViewport(page, name) {
  const state = await getStickyViewportState(page, name);
  expect(state.position).toBe('sticky');
  expect(state.height).toBeLessThanOrEqual(state.viewportHeight + 1);
  expect(Math.abs(state.top)).toBeLessThanOrEqual(1);
}

async function expectSupportFeature(page, expectedTitle) {
  const stage = page.locator('[data-landing-support-stage]');
  const phone = page.locator('[data-menorah-phone-mockup="support-pathway"]');

  await expect.poll(async () => stage.getAttribute('data-landing-active-feature')).toBe(expectedTitle);
  await expect(phone).toHaveAttribute('aria-label', `Menorah app example: ${expectedTitle}`);
}

test.describe('landing scroll animations', () => {
  test('the hero and support stages stay in sync with scroll progress', async ({ page }) => {
    await loadLanding(page);
    const initialDashboard = await getDashboardState(page);

    await scrollWithinSection(page, '[data-menorah-home-ready]', 0.35);
    await expect.poll(async () => (await getDashboardState(page)).opacity).toBeGreaterThan(0.95);
    const progressedDashboard = await getDashboardState(page);
    expect(progressedDashboard.transform).not.toBe(initialDashboard.transform);
    await expect.poll(async () => Number(await page.locator('[data-landing-hero-copy]').evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.05);
    await expectStickyViewport(page, 'hero');

    await scrollWithinSection(page, '#support-pathway', 0.3);
    await expectSupportFeature(page, 'Bookings');
    await expectStickyViewport(page, 'support');

    await scrollWithinSection(page, '#support-pathway', 0.55);
    await expectSupportFeature(page, 'Private Chat');

    await scrollWithinSection(page, '#support-pathway', 0.75);
    await expectSupportFeature(page, 'Profile');

    await scrollWithinSection(page, '#support-pathway', 0.9);
    await expect.poll(async () => Number(await page.locator('[data-landing-support-stage]').evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.6);

    await scrollWithinSection(page, '#support-pathway', 0.2);
    await expectSupportFeature(page, 'Discover');
  });

  test('the compact landing composition fits the viewport without overlapping hero copy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadLanding(page);

    await scrollWithinSection(page, '[data-menorah-home-ready]', 0.35);
    await expect.poll(async () => (await getDashboardState(page)).opacity).toBeGreaterThan(0.95);
    await expect.poll(async () => Number(await page.locator('[data-landing-hero-copy]').evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.05);
    await expectStickyViewport(page, 'hero');

    const visibleArticleLinks = await page.locator('header a[href="/articles"]').evaluateAll((links) =>
      links.filter((link) => getComputedStyle(link).display !== 'none').length
    );
    expect(visibleArticleLinks).toBe(0);

    await scrollWithinSection(page, '#support-pathway', 0.55);
    await expectSupportFeature(page, 'Private Chat');
    await expectStickyViewport(page, 'support');
    const phoneBounds = await page.locator('[data-menorah-phone-mockup="support-pathway"]').boundingBox();
    expect(phoneBounds).not.toBeNull();
    expect(phoneBounds.y).toBeGreaterThanOrEqual(0);
    expect(phoneBounds.y + phoneBounds.height).toBeLessThanOrEqual(844);
  });

  test('the compact landscape support stage keeps its phone within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await loadLanding(page);

    await scrollWithinSection(page, '#support-pathway', 0.55);
    await expectSupportFeature(page, 'Private Chat');
    await expectStickyViewport(page, 'support');
    const phoneBounds = await page.locator('[data-menorah-phone-mockup="support-pathway"]').boundingBox();
    expect(phoneBounds).not.toBeNull();
    expect(phoneBounds.y).toBeGreaterThanOrEqual(0);
    expect(phoneBounds.y + phoneBounds.height).toBeLessThanOrEqual(390);
    const copyBounds = await page.locator('[data-landing-support-copy]').boundingBox();
    expect(copyBounds).not.toBeNull();
    expect(copyBounds.y).toBeGreaterThanOrEqual(80);
    expect(copyBounds.y + copyBounds.height).toBeLessThanOrEqual(390);
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
