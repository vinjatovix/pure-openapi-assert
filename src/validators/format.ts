const regexCache = new Map<string, RegExp>();

export function getCachedRegex(pattern: string): RegExp {
  let rx = regexCache.get(pattern);
  if (!rx) {
    rx = new RegExp(pattern);
    regexCache.set(pattern, rx);
  }
  return rx;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const HOSTNAME_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export const isStrictDate = (val: string): boolean => {
  if (!DATE_REGEX.test(val)) return false;
  const parts = val.split('-');
  const yearStr = parts[0];
  const monthStr = parts[1];
  const dayStr = parts[2];
  if (!yearStr || !monthStr || !dayStr) return false;

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
};

export const isStrictDateTime = (val: string): boolean => {
  if (!DATE_TIME_REGEX.test(val)) return false;
  const datePart = val.substring(0, 10);
  return isStrictDate(datePart);
};

export const formatValidators: Record<string, (val: string) => boolean> = {
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
  hostname: (val) => val.length <= 255 && HOSTNAME_REGEX.test(val),
  ipv4: (val) => IPV4_REGEX.test(val)
};
