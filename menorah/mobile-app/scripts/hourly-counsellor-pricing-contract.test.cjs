const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const projectRoot = resolve(__dirname, "..");
const read = (relativePath) =>
  readFileSync(resolve(projectRoot, relativePath), "utf8");

test("fixed session packages are removed from Discover and navigation", () => {
  const discover = read("src/screens/discover/DiscoverModern.tsx");
  const navigator = read("src/navigation/RootNavigator.tsx");

  assert.doesNotMatch(
    discover,
    /Basic session|Premium session|Pro session|SESSION_DETAILS|SESSION_SEARCH_ITEMS|Session types/i,
  );
  assert.doesNotMatch(discover, /GenderSelection|SessionReview/);
  assert.match(discover, /Choose a counsellor, duration, date, and time\./);
  assert.match(discover, /navigation\.navigate\("CounsellorList"\)/);
  assert.doesNotMatch(navigator, /GenderSelection|SessionReview/);

  assert.equal(
    existsSync(resolve(projectRoot, "src/screens/booking/GenderSelection.tsx")),
    false,
  );
  assert.equal(
    existsSync(resolve(projectRoot, "src/screens/booking/SessionReview.tsx")),
    false,
  );
  assert.equal(
    existsSync(
      resolve(projectRoot, "src/components/discover/SessionTypeSelector.tsx"),
    ),
    false,
  );
});

test("counsellor profile owns duration selection and hourly price calculation", () => {
  const profile = read("src/screens/counsellor/CounsellorProfile.tsx");

  assert.match(profile, /DURATION_OPTIONS = \[60, 120, 180\]/);
  assert.match(profile, /useState\(60\)/);
  assert.match(
    profile,
    /getCounsellorAvailability\([\s\S]*?selectedDuration\s*\)/,
  );
  assert.match(
    profile,
    /Math\.round\(\(hourlyRate \* selectedDuration\) \/ 60\)/,
  );
  assert.match(profile, /label: ["']per hour["']/);
  assert.match(profile, /Rate × duration/);
  assert.match(profile, /sessionDuration: selectedDuration/);
  assert.doesNotMatch(profile, /label: ["']per session["']/);
});

test("booking review derives the displayed total from rate times duration", () => {
  const review = read("src/screens/booking/BookingReview.tsx");

  assert.match(
    review,
    /Math\.round\(\s*\(displayHourlyRate \* displayDuration\) \/ 60,?\s*\)/,
  );
  assert.match(review, /Counsellor rate/);
  assert.match(review, /\{hourlyRateLabel\} × \{durationLabel\}/);
  assert.doesNotMatch(
    review,
    /PRICE_CATEGORIES|categoryId|serviceCode|Basic Session|Premium Session|Pro Session|Elite Session/,
  );
});

test("all mobile booking entry points choose a counsellor first", () => {
  const entryPoints = [
    "src/screens/booking/Bookings.tsx",
    "src/screens/chat/ChatThread.tsx",
    "src/screens/profile/ProfileHomeModern.tsx",
  ]
    .map(read)
    .join("\n");

  assert.doesNotMatch(entryPoints, /GenderSelection|SessionReview/);
  assert.match(entryPoints, /CounsellorList/);
});
