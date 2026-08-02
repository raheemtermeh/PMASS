export interface DialCode {
  code: string;
  country: string;
  flag: string;
}

/** Dial codes offered in the profile picker, most relevant markets first. */
export const COUNTRY_DIAL_CODES: DialCode[] = [
  { code: "+98", country: "Iran", flag: "🇮🇷" },
  { code: "+971", country: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+90", country: "Turkey", flag: "🇹🇷" },
  { code: "+964", country: "Iraq", flag: "🇮🇶" },
  { code: "+974", country: "Qatar", flag: "🇶🇦" },
  { code: "+965", country: "Kuwait", flag: "🇰🇼" },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+968", country: "Oman", flag: "🇴🇲" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "+1", country: "United States / Canada", flag: "🇺🇸" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+39", country: "Italy", flag: "🇮🇹" },
  { code: "+34", country: "Spain", flag: "🇪🇸" },
  { code: "+31", country: "Netherlands", flag: "🇳🇱" },
  { code: "+46", country: "Sweden", flag: "🇸🇪" },
  { code: "+7", country: "Russia", flag: "🇷🇺" },
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
  { code: "+82", country: "South Korea", flag: "🇰🇷" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
];

const DEFAULT_DIAL = "+98";

/**
 * Splits a stored phone number into a dial code and the local part. Longest
 * codes are matched first so "+971" never resolves to "+97".
 */
export function splitPhone(raw?: string | null): { dial: string; number: string } {
  const value = (raw ?? "").trim();
  if (!value) return { dial: DEFAULT_DIAL, number: "" };
  if (!value.startsWith("+")) return { dial: DEFAULT_DIAL, number: value };

  const sorted = [...COUNTRY_DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const entry of sorted) {
    if (value.startsWith(entry.code)) {
      return { dial: entry.code, number: value.slice(entry.code.length).trim() };
    }
  }
  return { dial: DEFAULT_DIAL, number: value };
}

export function joinPhone(dial: string, number: string): string {
  const local = number.trim();
  if (!local) return "";
  return `${dial} ${local}`.trim();
}
