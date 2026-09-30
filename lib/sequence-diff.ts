export type ChangedSequenceIndexes = {
  before: Set<number>;
  after: Set<number>;
};

/** Return items not shared by the longest common subsequence. This keeps
 * insertions from shifting every block after them into a false positive. */
export function changedSequenceIndexes(
  before: readonly string[],
  after: readonly string[],
): ChangedSequenceIndexes {
  // Avoid a quadratic allocation for pathologically large generated
  // documents. Highlighting every block is conservative but remains usable.
  if (before.length * after.length > 1_000_000) {
    return {
      before: new Set(before.map((_, index) => index)),
      after: new Set(after.map((_, index) => index)),
    };
  }
  const rows = before.length + 1;
  const columns = after.length + 1;
  const lengths = new Uint32Array(rows * columns);
  const at = (row: number, column: number) => row * columns + column;

  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      lengths[at(row, column)] = before[row - 1] === after[column - 1]
        ? lengths[at(row - 1, column - 1)] + 1
        : Math.max(lengths[at(row - 1, column)], lengths[at(row, column - 1)]);
    }
  }

  const unchangedBefore = new Set<number>();
  const unchangedAfter = new Set<number>();
  let row = before.length;
  let column = after.length;
  while (row > 0 && column > 0) {
    if (before[row - 1] === after[column - 1]) {
      unchangedBefore.add(row - 1);
      unchangedAfter.add(column - 1);
      row--;
      column--;
    } else if (lengths[at(row - 1, column)] > lengths[at(row, column - 1)]) {
      row--;
    } else {
      column--;
    }
  }

  return {
    before: new Set(before.map((_, index) => index).filter((index) => !unchangedBefore.has(index))),
    after: new Set(after.map((_, index) => index).filter((index) => !unchangedAfter.has(index))),
  };
}
