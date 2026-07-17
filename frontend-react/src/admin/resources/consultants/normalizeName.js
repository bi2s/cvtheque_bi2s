function titleCaseWord(w) {
  return w
    .split('-')
    .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase() : seg))
    .join('-');
}

// "Prénom NOM" convention (French admin/HR convention, matches how names
// already render elsewhere in this app's exports) - every word but the
// last is title-cased, the last word (assumed to be the surname) is fully
// uppercased. Imperfect for multi-word surnames ("DE LA CRUZ" would only
// uppercase "CRUZ") - a real name-parsing library would be overkill for
// this; an admin can still type over it manually for that edge case.
export default function normalizeName(raw) {
  if (!raw) return raw;
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return raw;
  return words.map((w, i) => (i === words.length - 1 ? w.toUpperCase() : titleCaseWord(w))).join(' ');
}
