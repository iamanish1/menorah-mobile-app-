const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Discover replaces static session cards with the mobile counsellor directory", () => {
  const discover = read("src/screens/discover/DiscoverModern.tsx");

  assert.match(discover, /<MobileCounsellorDiscovery/);
  assert.doesNotMatch(discover, /<IOSSectionHeader title="Session types"/);
  assert.doesNotMatch(discover, /title="Find support"/);
  assert.doesNotMatch(discover, /title="Book session"/);
  assert.match(discover, /navigation\.navigate\("CounsellorList"/);
  assert.match(discover, /navigation\.navigate\("CounsellorProfile"/);
});

test("mobile directory uses production-backed search, filters, and booking actions", () => {
  const section = read(
    "src/components/discover/mobile-counsellor-discovery.tsx",
  );

  assert.match(section, /useCounsellors\(queryParams\)/);
  assert.match(section, /useSpecializations\(\)/);
  assert.match(section, /limit: 1/);
  assert.match(section, /placeholder="Search name or specialization"/);
  assert.match(section, /minHeight: 76/);
  assert.doesNotMatch(section, /Browse certified men's mental health/);
  assert.doesNotMatch(
    section,
    /Browse \$\{total\} certified men's mental health/,
  );
  assert.match(section, /availableSpecializations/);
  assert.match(section, /new Set\(/);
  assert.match(
    section,
    /onSubmitEditing=\{\(\) => setDebouncedSearch\(searchInput\.trim\(\)\)\}/,
  );
  assert.doesNotMatch(section, /QUICK_FILTERS|SlidersHorizontal/);
  assert.doesNotMatch(section, /Open all counsellor filters/);
  assert.doesNotMatch(section, /View profile|onViewProfile/);
  assert.match(section, />\s*Book now\s*</);
  assert.match(section, /onOpenCounsellor/);
  assert.match(section, /accessibilityState=\{\{ selected \}\}/);
});

test("counsellor preview stays compact and action focused", () => {
  const section = read(
    "src/components/discover/mobile-counsellor-discovery.tsx",
  );

  assert.doesNotMatch(section, /Next available|Therapy hrs|New to Menorah/);
  assert.doesNotMatch(section, /getSpecializationTags|StatTile/);
  assert.match(section, /minHeight: 136/);
  assert.match(section, /width: 80/);
  assert.match(section, /fontSize: 22/);
  assert.match(section, /backgroundColor: "#2F482E"/);
  assert.match(
    section,
    /accessibilityLabel=\{`Open \$\{counsellor\.name\} counsellor profile`\}/,
  );
  assert.match(section, /onPress=\{onOpen\}/);
  assert.doesNotMatch(section, /accessibilityLabel=\{`Book with/);
  assert.doesNotMatch(section, /backgroundColor: "rgba\(47,72,46,0\.92\)"/);
  assert.doesNotMatch(section, /BadgeCheck|VERIFIED/);
});

test("counsellor preview mirrors the web directory-wave color and motion", () => {
  const section = read(
    "src/components/discover/mobile-counsellor-discovery.tsx",
  );

  assert.match(section, /DIRECTORY_WAVE_COLORS/);
  assert.match(section, /"#2F482E"/);
  assert.match(section, /"#46A067"/);
  assert.match(section, /"#89D297"/);
  assert.match(section, /"#64633F"/);
  assert.match(section, /DIRECTORY_WAVE_FLOW_MS = 7200/);
  assert.match(section, /DIRECTORY_WAVE_RIBBON_MS = 6400/);
  assert.match(section, /DIRECTORY_WAVE_RINGS_MS = 8000/);
  assert.match(section, /useReducedMotion\(\)/);
  assert.match(section, /withRepeat\(/);
});

test("counsellor profile omits the redundant why-choose-me block", () => {
  const profile = read("src/screens/counsellor/CounsellorProfile.tsx");

  assert.doesNotMatch(profile, /Why choose me\?|WHY_ITEMS/);
  assert.doesNotMatch(profile, /Personalized Support|Evidence Based/);
  assert.match(profile, /Pick a Date & Time/);
});

test("counsellor directory omits the redundant trusted-professionals panel", () => {
  const directory = read("src/screens/counsellor/CounsellorList.tsx");

  assert.doesNotMatch(directory, /Verified & Trusted Professionals/);
  assert.doesNotMatch(
    directory,
    /All counsellors are verified and committed to your well-being/,
  );
  assert.doesNotMatch(directory, /ListFooterComponent=/);
});

test("counsellor directory keeps specializations inside the filter sheet", () => {
  const directory = read("src/screens/counsellor/CounsellorList.tsx");

  assert.match(directory, /useSpecializations\(\)/);
  assert.match(directory, /availableSpecializations/);
  assert.match(directory, /\[null, \.\.\.specializationTags\]\.map/);
  assert.match(directory, /setDraftSpecialization\(normalizedSpecialization\)/);
  assert.doesNotMatch(directory, /showAllSpecializations/);
  assert.doesNotMatch(directory, /Show all specializations/);
  assert.doesNotMatch(directory, /CATEGORIES/);
});

test("counsellor filter combines API specialization and requested price bands", () => {
  const directory = read("src/screens/counsellor/CounsellorList.tsx");

  assert.match(directory, /accessibilityLabel="Filter counsellors"/);
  assert.match(directory, /<Modal/);
  assert.match(directory, /PRICE_RANGES/);
  assert.match(directory, /₹1 – ₹1,000/);
  assert.match(directory, /₹1,000 – ₹3,000/);
  assert.match(directory, /₹3,000 – ₹5,000/);
  assert.match(directory, /₹5,000\+/);
  assert.match(directory, /minPrice: activePriceRange\.minPrice/);
  assert.match(directory, /maxPrice: activePriceRange\.maxPrice/);
  assert.match(directory, /useCounsellors\(counsellorQueryParams\)/);
  assert.match(directory, /Apply filters/);
});
