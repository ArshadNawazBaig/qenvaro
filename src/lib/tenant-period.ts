export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface ZonedDatePart extends CalendarDate {
  hour: number;
  minute: number;
  second: number;
}

export interface TenantCalendarPeriod {
  days: number;
  label: string;
  start: Date;
  end: Date;
  previousStart: Date;
  dateKeys: string[];
}

function partsInTimezone(date: Date, timezone: string): ZonedDatePart {
  const values = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get("year") ?? 1970,
    month: values.get("month") ?? 1,
    day: values.get("day") ?? 1,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

function shiftCalendarDate(value: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(
    Date.UTC(value.year, value.month - 1, value.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function calendarDateToUtc(value: CalendarDate, timezone: string): Date {
  const target = Date.UTC(value.year, value.month - 1, value.day);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = partsInTimezone(new Date(candidate), timezone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    candidate += target - observedAsUtc;
  }
  return new Date(candidate);
}

export function tenantCalendarPeriod(
  days: 7 | 30 | 90 | 120,
  timezone: string,
  now = new Date(),
): TenantCalendarPeriod {
  const current = partsInTimezone(now, timezone);
  const today = {
    year: current.year,
    month: current.month,
    day: current.day,
  };
  const first = shiftCalendarDate(today, -(days - 1));
  const tomorrow = shiftCalendarDate(today, 1);
  const previousFirst = shiftCalendarDate(first, -days);
  return {
    days,
    label: `Last ${days} days`,
    start: calendarDateToUtc(first, timezone),
    end: calendarDateToUtc(tomorrow, timezone),
    previousStart: calendarDateToUtc(previousFirst, timezone),
    dateKeys: Array.from({ length: days }, (_, index) => {
      const value = shiftCalendarDate(first, index);
      return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
    }),
  };
}
