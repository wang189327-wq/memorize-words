/** Record layout shared by IndexedDB and SQLite. No DOM or I/O. Committed records are immutable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WordMemoRecords = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const tables = ['books', 'learned', 'results', 'favorites', 'ratings', 'schedules'];
  const recordKeys = new Set([
    'deck',
    'learned',
    'results',
    'favorites',
    'favoriteChanges',
    'ratingEvents',
    'schedules',
  ]);
  const metadata = (state) =>
    Object.fromEntries(Object.entries(state).filter(([key]) => !recordKeys.has(key)));
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  async function normalizeLegacy(state) {
    const results = state.results.slice();
    // Same old backup on two devices must get the same IDs. Match the legacy sync hash,
    // then persist it once so later array reordering never assigns a different ID.
    for (let start = 0; start < results.length; start += 256) {
      await Promise.all(
        results.slice(start, start + 256).map(async (event, offset) => {
          if (event.eventId) return;
          const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(JSON.stringify(event) + '|' + (start + offset)),
          );
          const hex = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join('');
          results[start + offset] = { ...event, eventId: 'legacy-' + hex };
        }),
      );
    }
    return { ...state, results };
  }
  function rows(state) {
    return {
      get books() {
        return [[state.deck.bookId, state.deck]];
      },
      get learned() {
        return Object.entries(state.learned);
      },
      get results() {
        return state.results.map((event) => [event.eventId, event]);
      },
      get favorites() {
        return [
          ...new Set([
            ...Object.keys(state.favorites || {}),
            ...Object.keys(state.favoriteChanges || {}),
          ]),
        ].map((id) => [
          id,
          { active: !!state.favorites?.[id], change: state.favoriteChanges?.[id] },
        ]);
      },
      get ratings() {
        return (state.ratingEvents || []).map((event) => [event.eventId, event]);
      },
      get schedules() {
        return Object.entries(state.schedules || {});
      },
    };
  }
  /** Serialize only changed rows. A replacement is reserved for confirmed restores or another book. */
  function patch(next, previous, replace = false) {
    replace ||= !previous || next.deck.bookId !== previous.deck.bookId;
    const result = {
      replace,
      expectedBookId: previous?.deck.bookId || null,
      bookId: next.deck.bookId,
      puts: {},
      deletes: {},
    };
    const before = previous && !replace ? rows(previous) : {},
      after = rows(next);
    for (const table of tables) {
      if (!replace && table === 'books' && previous.deck === next.deck) continue;
      if (!replace && table === 'results' && previous.results === next.results) continue;
      if (!replace && table === 'ratings' && previous.ratingEvents === next.ratingEvents) continue;
      if (!replace && table === 'learned' && previous.learned === next.learned) continue;
      if (!replace && table === 'schedules' && previous.schedules === next.schedules) continue;
      if (
        !replace &&
        table === 'favorites' &&
        previous.favorites === next.favorites &&
        previous.favoriteChanges === next.favoriteChanges
      )
        continue;
      // The common case is append, optionally trimming the oldest displayed results.
      // Compare shared immutable references instead of allocating a 50000-entry Map.
      if (!replace && (table === 'results' || table === 'ratings')) {
        const key = table === 'results' ? 'results' : 'ratingEvents';
        const oldEvents = previous[key] || [],
          events = next[key] || [];
        const offset = events.length ? oldEvents.indexOf(events[0]) : oldEvents.length;
        const overlap = offset < 0 ? -1 : Math.min(oldEvents.length - offset, events.length);
        if (
          overlap >= 0 &&
          events.slice(0, overlap).every((event, index) => event === oldEvents[offset + index])
        ) {
          const puts = events.slice(overlap).map((event) => [event.eventId, event]);
          const deletes = [...oldEvents.slice(0, offset), ...oldEvents.slice(offset + overlap)].map(
            (event) => event.eventId,
          );
          if (puts.length) result.puts[table] = puts;
          if (deletes.length) result.deletes[table] = deletes;
          continue;
        }
      }
      const old = new Map(before[table] || []),
        current = new Map(after[table]);
      const puts = [...current].filter(([key, value]) => !same(old.get(key), value));
      const deletes = [...old.keys()].filter((key) => !current.has(key));
      if (puts.length) result.puts[table] = puts;
      if (deletes.length) result.deletes[table] = deletes;
    }
    const meta = metadata(next);
    if (replace || !same(meta, metadata(previous))) result.metadata = meta;
    return result;
  }
  function assemble(data, meta) {
    const book = (data.books || []).find(([id]) => id === meta.bookId)?.[1];
    if (!book) return null;
    const favorites = {},
      favoriteChanges = {};
    for (const [id, value] of data.favorites || []) {
      if (value.active) favorites[id] = true;
      if (value.change) favoriteChanges[id] = value.change;
    }
    return {
      ...meta.state,
      deck: book,
      learned: Object.fromEntries(data.learned || []),
      results: (data.results || [])
        .map(([, value]) => value)
        .sort(
          (a, b) =>
            (a.at || a.date).localeCompare(b.at || b.date) || a.eventId.localeCompare(b.eventId),
        ),
      favorites,
      favoriteChanges,
      ratingEvents: (data.ratings || []).map(([, value]) => value),
      schedules: Object.fromEntries(data.schedules || {}),
    };
  }
  return { tables, rows, metadata, normalizeLegacy, patch, assemble };
});
