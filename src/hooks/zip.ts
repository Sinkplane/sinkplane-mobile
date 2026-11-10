/** Pairs items by index, stopping at the shorter list. */
export function zip<A, B>(first: readonly A[], second: readonly B[]): [A, B][] {
  return first.flatMap((item, index): [A, B][] => {
    const other = second[index];
    return other === undefined ? [] : [[item, other]];
  });
}
