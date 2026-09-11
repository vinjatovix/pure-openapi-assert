import {
  BASE64_REGEX,
  DATE_REGEX,
  DATE_TIME_REGEX,
  EMAIL_REGEX,
  HOSTNAME_REGEX,
  IPV4_REGEX,
  IPV6_REGEX,
  MAX_HOSTNAME_LENGTH,
  MAX_CACHE_SIZE,
  UUID_REGEX
} from '../core/constants.js';

const regexCache = new Map<string, RegExp>();

/**
 * Compiles and caches a regular expression from an OpenAPI schema pattern.
 *
 * @security This function uses the native RegExp engine. Because it compiles
 * patterns dynamically from the schema, schemas MUST come from a trusted source.
 * Processing untrusted schemas could potentially expose the system to
 * Regular Expression Denial of Service (ReDoS) attacks. A maximum limit of
 * cached regexes is enforced to prevent Memory Leaks.
 */
export function getCachedRegex(pattern: string): RegExp {
  let rx = regexCache.get(pattern);
  if (!rx) {
    if (regexCache.size >= MAX_CACHE_SIZE) {
      const firstKey = regexCache.keys().next().value;
      regexCache.delete(firstKey as string);
    }
    rx = new RegExp(pattern);
    regexCache.set(pattern, rx);
  }
  return rx;
}

const isStrictDate = (val: string): boolean => {
  if (!DATE_REGEX.test(val)) return false;

  const year = parseInt(val.substring(0, 4), 10);
  const month = parseInt(val.substring(5, 7), 10);
  const day = parseInt(val.substring(8, 10), 10);

  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
};

const isStrictDateTime = (val: string): boolean => {
  if (!DATE_TIME_REGEX.test(val)) return false;
  const datePart = val.substring(0, 10);
  return isStrictDate(datePart);
};

export const formatRegistry: Record<string, (val: string) => boolean> = {
  uuid: (val) => UUID_REGEX.test(val),
  email: (val) => EMAIL_REGEX.test(val),
  date: isStrictDate,
  'date-time': isStrictDateTime,
  uri: (val) => {
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  hostname: (val) =>
    val.length <= MAX_HOSTNAME_LENGTH && HOSTNAME_REGEX.test(val),
  ipv4: (val) => IPV4_REGEX.test(val),
  ipv6: (val) => IPV6_REGEX.test(val),
  byte: (val) => BASE64_REGEX.test(val)
};
