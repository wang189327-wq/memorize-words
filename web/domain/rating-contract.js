/** Canonical rating wire contract. Generated CJS/IIFE copies are produced by tools/vendor-fsrs.mjs. */
export const algorithm = 'fsrs6-ts6.0.0-v1';
export const ratingModes = ['meaning', 'spelling', 'cloze', 'conversion'];
const fields = ['eventId', 'bookId', 'id', 'at', 'rating', 'mode', 'algorithm'];
const identifier = (value) =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9_-]{1,200}$/.test(value) &&
  !Object.prototype.hasOwnProperty.call(Object.prototype, value) &&
  value !== 'prototype';

/** Reject unknown data, invalid dates and clock errors; never rewrite an event's time. */
export function validateRating(event, { bookId, now = Date.now() } = {}) {
  if (
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event) ||
    fields.some((field) => !Object.hasOwn(event, field)) ||
    Object.keys(event).some((field) => !fields.includes(field)) ||
    !identifier(event.id) ||
    !/^[a-zA-Z0-9-]{16,128}$/.test(event.eventId || '') ||
    typeof event.bookId !== 'string' ||
    !event.bookId ||
    event.bookId.length > 100 ||
    (bookId !== undefined && event.bookId !== bookId) ||
    event.algorithm !== algorithm ||
    !Number.isInteger(event.rating) ||
    event.rating < 1 ||
    event.rating > 4 ||
    !ratingModes.includes(event.mode) ||
    typeof event.at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.at) ||
    !Number.isFinite(Date.parse(event.at)) ||
    new Date(event.at).toISOString() !== event.at ||
    Date.parse(event.at) < Date.UTC(2000, 0, 1) ||
    Date.parse(event.at) > now + 86400000
  )
    throw Error('智能复习评分格式或时间无效，请检查设备时间。');
  return event;
}
export function canonicalRating(event) {
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field, event[field]])));
}
/** Deterministic union. Same ID and different contents is a conflict, not last-writer-wins. */
export function mergeRatingEvents(left, right, options) {
  const events = new Map();
  for (const event of [...left, ...right]) {
    validateRating(event, options);
    const old = events.get(event.eventId);
    if (old && canonicalRating(old) !== canonicalRating(event))
      throw Error('智能复习事件标识冲突，请保留备份后联系维护者。');
    events.set(event.eventId, event);
  }
  return [...events.values()].sort(
    (a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId),
  );
}
