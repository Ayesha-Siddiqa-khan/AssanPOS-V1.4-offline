const pad = (value: number) => value.toString().padStart(2, '0');

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

interface DateParts {
  day: number;
  month: number;
  year: number;
}

const extractParts = (value: Date | string): DateParts | null => {
  if (value instanceof Date) {
    return {
      day: value.getDate(),
      month: value.getMonth() + 1,
      year: value.getFullYear(),
    };
  }

  if (typeof value === 'string') {
    const match = value.match(ISO_DATE_REGEX);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        day: parsed.getDate(),
        month: parsed.getMonth() + 1,
        year: parsed.getFullYear(),
      };
    }
  }

  return null;
};

export const formatDateForStorage = (value: Date): string => {
  const year = value.getFullYear();
  const month = pad(value.getMonth() + 1);
  const day = pad(value.getDate());
  return `${year}-${month}-${day}`;
};

export const formatDateForDisplay = (
  value?: Date | string | null
): string => {
  if (!value) {
    return '--';
  }

  const parts = extractParts(value);
  if (!parts) {
    return '--';
  }

  return `${pad(parts.day)}-${pad(parts.month)}-${parts.year}`;
};

export const formatDateTimeForDisplay = (
  date?: string | null,
  time?: string | null,
  atLabel = 'at'
): string => {
  const formattedDate = formatDateForDisplay(date);
  if (formattedDate === '--') {
    return '--';
  }

  if (!time) {
    return formattedDate;
  }

  return `${formattedDate} ${atLabel} ${time}`;
};
