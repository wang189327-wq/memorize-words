/** Repeatable synthetic benchmark. No private book, disk timing, or device performance claim. */
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url),
  C = require('../web/core.js'),
  R = require('../web/storage/records.js');
const demo = require('../tests/fixtures/demo-deck.json');
for (const count of [6, 5470]) {
  const deck = {
    ...demo,
    cards: Array.from({ length: count }, (_, i) => ({
      ...demo.cards[i % 6],
      id: `synthetic-${i}`,
      word: `synthetic-${i}`,
      order: i + 1,
    })),
  };
  for (const events of [0, 5000, 50000]) {
    const state = C.emptyState(deck);
    state.results = Array.from({ length: events }, (_, i) => ({
      id: deck.cards[i % count].id,
      mode: 'spelling',
      correct: true,
      date: '2026-11-08',
      at: '2026-11-08T04:00:00.000Z',
      eventId: `synthetic-event-${i}`,
    }));
    const next = {
      ...state,
      results: [
        ...state.results,
        {
          id: deck.cards[0].id,
          mode: 'spelling',
          correct: true,
          date: '2026-11-08',
          eventId: 'last-test-event-0001',
        },
      ].slice(-50000),
    };
    const samples = [];
    for (let run = 0; run < 5; run++) {
      let at = performance.now();
      C.validateState(next);
      const full = JSON.stringify(next),
        oldMs = performance.now() - at;
      at = performance.now();
      const patch = R.patch(next, state);
      C.validateState(
        {
          ...next,
          learned: Object.fromEntries(patch.puts.learned || []),
          results: (patch.puts.results || []).map(([, event]) => event),
        },
        state.deck,
      );
      const raw = JSON.stringify(patch);
      samples.push({
        oldMs,
        patchMs: performance.now() - at,
        fullBytes: Buffer.byteLength(full),
        patchBytes: Buffer.byteLength(raw),
      });
    }
    samples.sort((a, b) => a.patchMs - b.patchMs);
    console.log(
      JSON.stringify({
        cards: count,
        events,
        median: samples[2],
        scope: 'Node CPU and serialized payload only; no disk or Android device measurement',
      }),
    );
  }
}
