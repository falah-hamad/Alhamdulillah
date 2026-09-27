export interface CountryCode {
  code: string;
  country: string;
  flag: string;
  sample: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: '+964', country: 'العراق (Iraq)', flag: '🇮🇶', sample: '770 123 4567' },
  { code: '+966', country: 'المملكة العربية السعودية', flag: '🇸🇦', sample: '50 123 4567' },
  { code: '+971', country: 'الإمارات العربية المتحدة', flag: '🇦🇪', sample: '50 123 4567' },
  { code: '+965', country: 'الكويت', flag: '🇰🇼', sample: '9123 4567' },
  { code: '+974', country: 'قطر', flag: '🇶🇦', sample: '5512 3456' },
  { code: '+973', country: 'البحرين', flag: '🇧🇭', sample: '3612 3456' },
  { code: '+968', country: 'عُمان', flag: '🇴🇲', sample: '9123 4567' },
  { code: '+962', country: 'الأردن', flag: '🇯🇴', sample: '7 9123 4567' },
  { code: '+20', country: 'مصر', flag: '🇪🇬', sample: '10 1234 5678' },
  { code: '+961', country: 'لبنان', flag: '🇱🇧', sample: '70 123 456' },
  { code: '+963', country: 'سوريا', flag: '🇸🇾', sample: '93 123 4567' },
  { code: '+970', country: 'فلسطين', flag: '🇵🇸', sample: '59 123 4567' },
  { code: '+967', country: 'اليمن', flag: '🇾🇪', sample: '77 123 4567' },
  { code: '+212', country: 'المغرب', flag: '🇲🇦', sample: '612 345 678' },
  { code: '+213', country: 'الجزائر', flag: '🇩🇿', sample: '551 234 567' },
  { code: '+216', country: 'تونس', flag: '🇹🇳', sample: '20 123 456' },
  { code: '+218', country: 'ليبيا', flag: '🇱🇾', sample: '91 123 4567' },
  { code: '+249', country: 'السودان', flag: '🇸🇩', sample: '91 123 4567' },
  { code: '+90', country: 'تركيا', flag: '🇹🇷', sample: '532 123 4567' },
  { code: '+1', country: 'الولايات المتحدة / كندا', flag: '🇺🇸', sample: '202 555 0123' },
  { code: '+44', country: 'المملكة المتحدة', flag: '🇬🇧', sample: '7911 123456' },
  { code: '+49', country: 'ألمانيا', flag: '🇩🇪', sample: '151 12345678' },
  { code: '+46', country: 'السويد', flag: '🇸🇪', sample: '70 123 4567' },
  { code: '+31', country: 'هولندا', flag: '🇳🇱', sample: '6 12345678' },
  { code: '+33', country: 'فرنسا', flag: '🇫🇷', sample: '6 12 34 56 78' },
  { code: '+60', country: 'ماليزيا', flag: '🇲🇾', sample: '12 345 6789' },
];

/**
 * Format phone number to international E.164-compatible format (+[countryCode][digits])
 */
export function formatInternationalPhoneNumber(dialCode: string, nationalNumber: string): string {
  // Strip whitespace, hyphens, and parentheses
  let cleaned = nationalNumber.replace(/[\s\-\(\)]/g, '');

  // If user entered full number starting with +
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // Remove leading zeros if user typed 0770... or 050...
  while (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return `${cleanDial}${cleaned}`;
}
