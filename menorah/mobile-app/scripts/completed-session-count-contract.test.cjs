const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const mobileRoot = resolve(__dirname, "..");
const backendRoot = resolve(mobileRoot, "..", "backend");
const readMobile = (relativePath) =>
  readFileSync(resolve(mobileRoot, relativePath), "utf8");
const readBackend = (relativePath) =>
  readFileSync(resolve(backendRoot, relativePath), "utf8");

test("public counsellor APIs derive totals from completed bookings", () => {
  const route = readBackend("src/routes/counsellors.js");
  const counter = readBackend("src/services/counsellorCompletedSessions.js");

  assert.match(counter, /status: COMPLETED_BOOKING_STATUS/);
  assert.match(counter, /BookingModel\.countDocuments/);
  assert.match(counter, /BookingModel\.aggregate/);
  assert.match(route, /countCompletedSessionsByCounsellor/);
  assert.match(route, /countCompletedSessions\(counsellor\._id\)/);
  assert.match(route, /totalSessions: completedSessionCounts\.get/);
  assert.match(route, /completedSessions: totalSessions/);
  assert.doesNotMatch(route, /totalSessions: counsellor\.totalSessions/);
});

test("mobile profile refetches and shows the exact completed-session count", () => {
  const queries = readMobile("src/hooks/useQueries.ts");
  const profile = readMobile("src/screens/counsellor/CounsellorProfile.tsx");

  assert.match(queries, /refetchOnMount: ["']always["']/);
  assert.match(
    profile,
    /value: \(counsellor\.totalSessions \|\| 0\)\.toLocaleString\(\s*["']en-IN["']\s*,?\s*\)/,
  );
  assert.match(profile, /label: ["']completed["']/);
  assert.doesNotMatch(
    profile,
    /totalSessions \|\| 0\}\+|label: ["']sessions["']/,
  );
});
