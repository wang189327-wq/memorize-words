/** Long-term review rules. UI code supplies a deliberate rating; this module never guesses one. */
import { fsrs, createEmptyCard, generatorParameters } from '../vendor/fsrs.mjs';
import { algorithm, validateRating, mergeRatingEvents } from './rating-contract.js';

export { algorithm, mergeRatingEvents };
export const feedback = [null, '不记得', '困难', '记得', '很熟悉'];
// Version these parameters together with algorithm. Changing defaults must not rewrite old history.
export const parameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
  ],
});
const engine = fsrs(parameters);

function advance(previous, event) {
  const at = new Date(event.at);
  const card = previous
    ? {
        ...previous.card,
        due: new Date(previous.card.due),
        last_review: previous.card.last_review ? new Date(previous.card.last_review) : undefined,
      }
    : createEmptyCard(at);
  const next = engine.next(card, at, event.rating).card;
  return {
    algorithm,
    lastEventAt: event.at,
    lastEventId: event.eventId,
    card: JSON.parse(JSON.stringify(next)),
  };
}
/** Replaying an imported or merged event set is deterministic, including simultaneous events. */
export function rebuildSchedule(events, bookId, now = Date.now()) {
  const schedules = {};
  for (const event of mergeRatingEvents([], events, { bookId, now }))
    schedules[event.id] = advance(schedules[event.id], event);
  return schedules;
}
export function restoreScheduler(state, now = Date.now()) {
  const events = state.ratingEvents || [],
    ids = new Set(state.deck.cards.map((card) => card.id));
  for (const event of events) {
    validateRating(event, { bookId: state.deck.bookId, now });
    if (!ids.has(event.id)) throw Error('智能复习记录含未知单词。');
  }
  return {
    ...state,
    ratingEvents: events,
    schedules: rebuildSchedule(events, state.deck.bookId, now),
    schedulerAlgorithm: algorithm,
  };
}
/** Old learned words have no fabricated rating: they wait in the initial due queue. */
export function dueCards(state, now = Date.now()) {
  return state.deck.cards
    .filter(
      (card) =>
        state.learned[card.id] &&
        (!state.schedules?.[card.id] || Date.parse(state.schedules[card.id].card.due) <= now),
    )
    .sort(
      (a, b) =>
        (Date.parse(state.schedules?.[a.id]?.card.due) || 0) -
          (Date.parse(state.schedules?.[b.id]?.card.due) || 0) || a.order - b.order,
    );
}
export function recordRating(
  state,
  { id, rating, mode, at = new Date().toISOString(), eventId = crypto.randomUUID() },
) {
  if (!state.learned[id] || !state.deck.cards.some((card) => card.id === id))
    throw Error('请先学习这个单词，再提交智能复习评分。');
  const event = { eventId, id, bookId: state.deck.bookId, at, rating, mode, algorithm };
  validateRating(event, { bookId: state.deck.bookId });
  if ((state.ratingEvents || []).some((old) => old.eventId === eventId))
    throw Error('评分已经提交，请勿重复操作。');
  const previous = state.schedules?.[id];
  const chronological =
    !previous ||
    at > previous.lastEventAt ||
    (at === previous.lastEventAt && eventId > previous.lastEventId);
  const ratingEvents = [...(state.ratingEvents || []), event];
  const schedules = chronological
    ? { ...state.schedules, [id]: advance(previous, event) }
    : rebuildSchedule(ratingEvents, state.deck.bookId);
  return { ...state, ratingEvents, schedules, schedulerAlgorithm: algorithm };
}
export function mergeRatings(state, incoming) {
  return restoreScheduler({
    ...state,
    ratingEvents: mergeRatingEvents(state.ratingEvents || [], incoming, {
      bookId: state.deck.bookId,
    }),
  });
}
