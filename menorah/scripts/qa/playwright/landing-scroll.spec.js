const { test, expect } = require('@playwright/test');

const landingUrl = process.env.QA_LANDING_URL || process.env.QA_WWW_URL || 'https://menorah.me';

async function loadLanding(page, reducedMotion = 'no-preference') {
  await page.emulateMedia({ reducedMotion });
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

async function scrollWithWheel(page, x, y, deltaY) {
  await page.mouse.move(x, y);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, deltaY);
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
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

async function expectHeroBackgroundVideo(page) {
  const video = page.locator('[data-menorah-home-ready] video');
  const wash = page.locator('[data-landing-hero-video-wash]');

  await expect(video).toBeVisible();
  await expect(wash).toBeVisible();
  await expect.poll(async () => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(2);

  const initialTime = await video.evaluate(async (element) => {
    await element.play();
    return element.currentTime;
  });

  await expect.poll(async () => video.evaluate((element) => element.currentTime)).toBeGreaterThan(initialTime + 0.05);

  const state = await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      opacity: Number(style.opacity),
      visibility: style.visibility,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(state.opacity).toBeGreaterThan(0.99);
  expect(state.visibility).toBe('visible');
  expect(state.width).toBeGreaterThanOrEqual(state.viewportWidth);
  expect(state.height).toBeGreaterThanOrEqual(state.viewportHeight);
}

async function expectHeroFallbackSurface(page) {
  const backgroundImage = await page.locator('[data-menorah-home-ready]').evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(backgroundImage).not.toBe('none');
}

async function expectDashboardFeature(page, feature) {
  await expect.poll(async () => page.locator('[data-product-dashboard]').getAttribute('data-landing-scroll-feature')).toBe(feature);
}

test.describe('landing scroll animations', () => {
  test('the hero background video has a playable visible frame', async ({ page }) => {
    await loadLanding(page);
    await expectHeroBackgroundVideo(page);
    await expectHeroFallbackSurface(page);
  });

  test('real wheel input advances the hero animation', async ({ page }) => {
    await loadLanding(page);
    await scrollWithWheel(page, 56, 560, 420);
    await expect.poll(async () => (await getDashboardState(page)).opacity).toBeGreaterThan(0.05);
    await scrollWithWheel(page, 640, 540, 420);
    await expect.poll(async () => (await getDashboardState(page)).opacity).toBeGreaterThan(0.8);
  });

  test('reduced motion keeps showcase content in sync with scroll', async ({ page }) => {
    await loadLanding(page, 'reduce');

    await scrollWithinSection(page, '[data-menorah-home-ready]', 0.7);
    await expectDashboardFeature(page, 'Bookings');
    await expect.poll(async () => Number(await page.locator('[data-landing-hero-copy]').evaluate((element) => getComputedStyle(element).opacity))).toBe(0);

    await scrollWithinSection(page, '#support-pathway', 0.55);
    await expectSupportFeature(page, 'Private Chat');

    await scrollWithinSection(page, '#support-pathway', 0.75);
    await expectSupportFeature(page, 'Profile');
  });

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
    await expectHeroFallbackSurface(page);

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
