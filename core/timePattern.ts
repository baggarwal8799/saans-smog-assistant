/** How a clock time is written, in English or Hindi, kept apart from how askedTimes.ts judges it. */

/** "शाम ", "सुबह को ": a Hindi part of the day before the hour, which sets am or pm. */
const DAY_PART = String.raw`(?:(?<part>सुबह|दोपहर|शाम|रात)\s+(?:को\s+)?)?`;
/** "7", "18": not the tail of a longer number, a time or a decimal. */
const HOUR = String.raw`(?<![\d:.])(?<hour>\d{1,2})`;
/** ":30". */
const MINUTE = String.raw`(?::(?<minute>[0-5]\d))?`;
/** " am", "pm", " p.m.", "6 a. m". */
const AM_PM = String.raw`\s*(?<ampm>[ap])\.?\s?m\b\.?`;
/** " बजे", Hindi for "o'clock". */
const BAJE = String.raw`\s*(?<baje>बजे)`;
/** Rules out "7:300" and "123", whose digits run on. */
const NO_MORE_DIGITS = String.raw`(?![\d:])`;
/** " pm" or " बजे" after the hour, or neither. */
const SUFFIX = `(?:${AM_PM}|${BAJE})?`;

/** "7:30", "7 am", "6 p.m.", "शाम 6 बजे", "सुबह को 7:30"; a bare "7" matches too, and the reader drops it. */
export const TIME = new RegExp(`${DAY_PART}${HOUR}${MINUTE}${SUFFIX}${NO_MORE_DIGITS}`, 'giu');
