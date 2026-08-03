import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));

const files = {
  title: ['en-US/title.txt', 30],
  shortDescription: ['en-US/short-description.txt', 80],
  fullDescription: ['en-US/full-description.txt', 4000],
  releaseNotes: ['en-US/release-notes-2.7.0.txt', 500],
};

const content = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([name, [relativePath]]) => [
    name,
    (await readFile(path.join(directory, relativePath), 'utf8')).trim(),
  ]),
));

const errors = [];

for (const [name, [, maximumLength]] of Object.entries(files)) {
  const value = content[name];
  if (!value) errors.push(`${name} must not be empty`);
  if (value.length > maximumLength) {
    errors.push(`${name} is ${value.length} characters; maximum is ${maximumLength}`);
  }
}

if (content.title !== 'Menorah Health') {
  errors.push('title must be exactly "Menorah Health"');
}

const listingCopy = `${content.shortDescription}\n${content.fullDescription}`;
const requiredPatterns = [
  [/verified counsellors/i, 'verified counsellors'],
  [/hourly rates?/i, 'hourly rates'],
  [/secure in-app chat/i, 'secure in-app chat'],
  [/wellbeing check-ins/i, 'wellbeing check-ins'],
  [/not (?:an )?emergency|not an emergency/i, 'emergency-service limitation'],
  [/not (?:provide )?a diagnosis|not diagnostic/i, 'non-diagnostic limitation'],
];

for (const [pattern, label] of requiredPatterns) {
  if (!pattern.test(listingCopy)) errors.push(`listing copy must include ${label}`);
}

const prohibitedPatterns = [
  [/\b(?:fully|completely|100%)\s+free\b/i, 'fully-free claim'],
  [/\bpsycholog(?:y|ist)\s+students?\b/i, 'psychology-student claim'],
  [/\b24\s*\/\s*7\b/i, '24/7 claim'],
  [/\babsolute(?:ly)?\s+confidential(?:ity)?\b/i, 'absolute-confidentiality claim'],
  [/\bguarantee(?:d|s)?\s+(?:confidentiality|results?|outcomes?)\b/i, 'guaranteed claim'],
  [/(?<!not )\b(?:offers?|provides?)\s+(?:a\s+)?diagnos(?:is|tic)\b/i, 'diagnostic-service claim'],
  [/\b(?:is|provides?)\s+(?:an?\s+)?(?:emergency|crisis)\s+service\b/i, 'emergency-service claim'],
];

for (const [pattern, label] of prohibitedPatterns) {
  if (pattern.test(listingCopy)) errors.push(`listing copy contains prohibited ${label}`);
}

if (!/\b2\.7\.0\b/.test(content.releaseNotes)) {
  errors.push('release notes must identify version 2.7.0');
}

if (errors.length > 0) {
  console.error('Android store metadata validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Android store metadata validation passed.');
}
