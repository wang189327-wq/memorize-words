/** Pure 7/18-word spelling checkpoint rules, independent of the UI. */
export function learnWithDrill(current, C = globalThis.WordMemo) {
  const id = C.learningQueue(current)[0],
    next = C.learnNextWord(current),
    old = current.learningPlan.drill || { seen: [], lastReviewed: 0 },
    seen = [...old.seen, id],
    n = seen.length,
    remaining = C.learningQueue(next).length;
  let ids = null;
  if (n % 18 === 0) ids = seen.slice(-18);
  else if (n % 7 === 0) ids = seen.slice(-7);
  else if (!remaining) ids = seen.slice(old.lastReviewed);
  return {
    ...next,
    learningPlan: {
      ...next.learningPlan,
      drill: {
        seen,
        lastReviewed: ids?.length ? n : old.lastReviewed,
        pending: ids?.length ? { ids, index: 0, retry: [], round: 0 } : null,
      },
    },
  };
}
