export type PhoneCountry = {
  iso2: string;
  name: string;
  dialCode: string;
};

export const DEFAULT_PHONE_COUNTRY = 'AE';

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso2: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { iso2: 'IN', name: 'India', dialCode: '91' },
  { iso2: 'US', name: 'United States', dialCode: '1' },
  { iso2: 'GB', name: 'United Kingdom', dialCode: '44' },
  { iso2: 'CA', name: 'Canada', dialCode: '1' },
  { iso2: 'AU', name: 'Australia', dialCode: '61' },
  { iso2: 'PK', name: 'Pakistan', dialCode: '92' },
  { iso2: 'BD', name: 'Bangladesh', dialCode: '880' },
  { iso2: 'LK', name: 'Sri Lanka', dialCode: '94' },
  { iso2: 'NP', name: 'Nepal', dialCode: '977' },
  { iso2: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { iso2: 'QA', name: 'Qatar', dialCode: '974' },
  { iso2: 'KW', name: 'Kuwait', dialCode: '965' },
  { iso2: 'OM', name: 'Oman', dialCode: '968' },
  { iso2: 'BH', name: 'Bahrain', dialCode: '973' },
  { iso2: 'SG', name: 'Singapore', dialCode: '65' },
  { iso2: 'MY', name: 'Malaysia', dialCode: '60' },
  { iso2: 'DE', name: 'Germany', dialCode: '49' },
  { iso2: 'FR', name: 'France', dialCode: '33' },
  { iso2: 'NL', name: 'Netherlands', dialCode: '31' },
  { iso2: 'ZA', name: 'South Africa', dialCode: '27' },
];

export const stripPhoneDigits = (value: string) => value.replace(/\D/g, '');

export const getDefaultPhoneCountry = () =>
  PHONE_COUNTRIES.find((country) => country.iso2 === DEFAULT_PHONE_COUNTRY) || PHONE_COUNTRIES[0];

export const parsePhoneNumberParts = (value = '') => {
  const digits = stripPhoneDigits(value);
  const fallback = getDefaultPhoneCountry();
  const country = [...PHONE_COUNTRIES]
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((candidate) => digits.startsWith(candidate.dialCode)) || fallback;

  const nationalNumber = digits.startsWith(country.dialCode)
    ? digits.slice(country.dialCode.length)
    : digits;

  return { country, nationalNumber };
};

export const buildPhoneNumber = (country: PhoneCountry, nationalNumber: string) => {
  const digits = stripPhoneDigits(nationalNumber);
  return digits ? `+${country.dialCode}${digits}` : '';
};
