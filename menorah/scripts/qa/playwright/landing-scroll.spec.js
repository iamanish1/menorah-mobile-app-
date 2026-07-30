const { test, expect } = require("@playwright/test");

const landingUrl = process.env.QA_LANDING_URL || "https://menorah.me";

async function loadLanding(page) {
  await page.goto(landingUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-menorah-home-ready]")).toBeVisible();
  await expect(page.locator('[aria-label="Loading Menorah"]')).toHaveCount(0);
}

async function scrollWithinSection(page, selector, progress) {
  await page.locator(selector).evaluate((element, nextProgress) => {
    document.documentElement.style.scrollBehavior = "auto";
    const rect = element.getBoundingClientRect();
    const sectionTop = window.scrollY + rect.top;
    const travel = Math.max(element.getBoundingClientRect().height - window.innerHeight, 1);
    window.scrollTo(0, sectionTop + travel * nextProgress);
  }, progress);
}

async function dashboardState(page) {
  return page.locator("[data-product-dashboard]").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      feature: element.getAttribute("data-landing-scroll-feature"),
      opacity: Number(style.opacity),
      transform: style.transform
    };
  });
}

test.describe("landing media and scroll resilience", () => {
  test("hero has a visible fallback and a viewport-sized sticky stage", async ({ page }) => {
    const mediaRequests = [];
    page.on("request", (request) => {
      if (request.resourceType() === "media") {
        mediaRequests.push(request.url());
      }
    });

    await page.setViewportSize({ width: 1366, height: 640 });
    await loadLanding(page);

    const state = await page.locator('[data-landing-scroll-viewport="hero"]').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        height: element.getBoundingClientRect().height,
        position: style.position,
        viewportHeight: window.innerHeight
      };
    });

    expect(state.position).toBe("sticky");
    expect(state.height).toBeLessThanOrEqual(state.viewportHeight + 1);
    expect(state.backgroundImage).not.toBe("none");

    const video = page.locator("[data-menorah-home-ready] video");
    await expect(video).toHaveAttribute("poster", /hero-background-poster-v20260730/);
    expect(mediaRequests.some((url) => url.includes("hf_20260328_083109"))).toBe(false);
    expect(mediaRequests.some((url) => url.includes("hf_20260319_015952"))).toBe(false);
  });

  test("mockup follows scroll without frame-dependent smoothing", async ({ page }) => {
    await loadLanding(page);
    const initial = await dashboardState(page);

    await scrollWithinSection(page, "[data-menorah-home-ready]", 0.35);
    await expect.poll(async () => (await dashboardState(page)).opacity).toBeGreaterThan(0.95);

    const progressed = await dashboardState(page);
    expect(progressed.transform).not.toBe(initial.transform);
  });

  test("reduced motion uses discrete scroll states instead of a frozen mockup", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadLanding(page);
    expect((await dashboardState(page)).opacity).toBe(0);

    await scrollWithinSection(page, "[data-menorah-home-ready]", 0.7);
    await expect.poll(async () => (await dashboardState(page)).opacity).toBe(1);
    await expect.poll(async () => (await dashboardState(page)).feature).toBe("Bookings");
  });

  test("blocked autoplay still leaves the forest background visible", async ({ page }) => {
    await page.route("**/*.mp4", (route) => route.abort("failed"));
    await loadLanding(page);

    const fallback = await page.locator('[data-landing-scroll-viewport="hero"]').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage
      };
    });

    expect(fallback.backgroundImage).not.toBe("none");
    expect(fallback.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator("[data-hero-video-playback-control]")).toBeVisible();
  });

  test("missing modern observer APIs do not crash the landing", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "ResizeObserver", { value: undefined, configurable: true });
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const media = originalMatchMedia(query);
        Object.defineProperty(media, "addEventListener", { value: undefined, configurable: true });
        Object.defineProperty(media, "removeEventListener", { value: undefined, configurable: true });
        return media;
      };
    });

    await loadLanding(page);
    await scrollWithinSection(page, "[data-menorah-home-ready]", 0.35);
    await expect.poll(async () => (await dashboardState(page)).opacity).toBeGreaterThan(0.95);
  });

  test("support showcase fits the viewport and advances with reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadLanding(page);

    const supportViewport = page.locator('[data-landing-scroll-viewport="support"]');
    await expect(supportViewport).toHaveCSS("position", "sticky");
    expect(await supportViewport.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(641);

    await scrollWithinSection(page, "#support-pathway", 0.75);
    await expect
      .poll(() => page.locator("[data-landing-support-stage]").getAttribute("data-landing-active-feature"))
      .toBe("Profile");
  });
});
