const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("mobile first-login tour replaces the promotional free-session modal", () => {
  const tabBar = read("src/components/ios/IOSFloatingTabBar.tsx");
  const tour = read("src/components/onboarding/first-login-tour.tsx");

  assert.ok(tabBar.includes("<FirstLoginTour"));
  assert.doesNotMatch(tabBar, /FreeSessionModal|hasSeenFreeSessionModal/);
  assert.doesNotMatch(
    tour,
    /Book My Free Session|First Session is on Us|completely free/i,
  );
});

test("tour covers every mobile tab and advances the real tab navigator", () => {
  const tour = read("src/components/onboarding/first-login-tour.tsx");

  for (const route of ["Discover", "Bookings", "Chat", "Profile"]) {
    assert.match(tour, new RegExp(`route: ["']${route}["']`));
  }

  assert.match(tour, /onNavigate\(currentStep\.route\)/);
  assert.match(tour, /accessibilityRole="progressbar"/);
  assert.match(tour, /Previous tour step/);
  assert.match(tour, /Next tour step/);
  assert.match(tour, /Finish app tour/);
});

test("tour completion is versioned and scoped to the signed-in user", () => {
  const tour = read("src/components/onboarding/first-login-tour.tsx");

  assert.match(tour, /menorah-mobile-user-tour-v1/);
  assert.match(tour, /buildTourStorageKey\(user\.id\)/);
  assert.match(tour, /AsyncStorage\.getItem\(storageKey\)/);
  assert.match(
    tour,
    /AsyncStorage\.setItem\(storageKey, new Date\(\)\.toISOString\(\)\)/,
  );
});

test("tour lifts each selected tab into an accessible animated spotlight", () => {
  const tour = read("src/components/onboarding/first-login-tour.tsx");

  assert.match(tour, /TOUR_TAB_PRESENTATION/);
  assert.match(tour, /floatingTabX\.value = withSpring/);
  assert.match(tour, /floatingTabY\.value = withSpring/);
  assert.match(tour, /haloScale\.value = withSequence/);
  assert.match(tour, /useReducedMotion\(\)/);
  assert.match(tour, /pointerEvents="none"/);
});
