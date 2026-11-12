/**
 * Surgical specimen / block labels — mirrors backend app/utils/surgical_labels.py.
 *
 * Two schemes (System Settings → Workflow → Specimen / Block Label):
 *  - letter_number (default): specimens A, B, C; blocks A1, A2, B1.
 *  - number_letter: specimens 1, 2, 3; blocks lettered A, B, C … Z, AA across
 *    the whole case. The letter comes from the block's `case_block_seq`, set
 *    by the backend: re-sorted in specimen order while the case is in the
 *    gross room, fixed once it has left (a later block then goes last).
 *
 * A case's scheme is read from its own labels (numeric specimen labels mean
 * number_letter); the setting only names the first specimen of a new case.
 */

export type SurgicalLabelScheme = "letter_number" | "number_letter";
export type SurgicalBlockDeleteMode = "renumber" | "keep_gap";

/** 1 → A, 26 → Z, 27 → AA, 28 → AB (spreadsheet columns). */
export function seqToLetters(n: number): string {
  if (!Number.isInteger(n) || n < 1) return "";
  let letters = "";
  let rest = n;
  while (rest > 0) {
    const rem = (rest - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    rest = Math.floor((rest - 1) / 26);
  }
  return letters;
}

export function isNumericLabel(label?: string | null): boolean {
  return !!label && /^\d+$/.test(label);
}

interface BlockLike {
  block_code?: string | null;
  case_block_seq?: number | null;
  block_no?: number | string | null;
  specimen_label?: string | null;
}

/**
 * The block's printed label. Prefers the backend's `block_code`; falls back to
 * the case-wide letter, then to the historic `${specimen_label}${block_no}`.
 */
export function formatBlockCode(block?: BlockLike | null, specimenLabel?: string | null): string {
  if (!block) return "";
  if (block.block_code) return block.block_code;
  if (block.case_block_seq != null) return seqToLetters(block.case_block_seq);
  return `${specimenLabel ?? block.specimen_label ?? ""}${block.block_no ?? ""}`;
}

/** The number a block's run is counted on: case-wide letter if any, else block_no. */
export function blockRunNumber(block: BlockLike): number {
  if (block.case_block_seq != null) return block.case_block_seq;
  return parseInt(String(block.block_no ?? ""), 10) || 0;
}

/** Sort specimen labels in issue order: 1, 2 … 9, 10 and A … Z, AA. */
export function compareSpecimenLabels(a?: string | null, b?: string | null): number {
  const x = a ?? "";
  const y = b ?? "";
  if (x.length !== y.length) return x.length - y.length;
  return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
}

/** Scheme existing labels are in, or undefined when there are none. */
export function schemeOfLabels(labels: (string | null | undefined)[]): SurgicalLabelScheme | undefined {
  const first = labels.find((l) => !!l);
  if (!first) return undefined;
  return isNumericLabel(first) ? "number_letter" : "letter_number";
}

/** Label of the specimen at 0-based position `index`. */
export function specimenLabelAt(index: number, scheme: SurgicalLabelScheme): string {
  return scheme === "number_letter" ? String(index + 1) : seqToLetters(index + 1);
}

function lettersToSeq(letters: string): number | undefined {
  if (!/^[A-Za-z]+$/.test(letters)) return undefined;
  return letters
    .toUpperCase()
    .split("")
    .reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

/** The label after the highest existing one, in the case's scheme. */
export function nextSpecimenLabel(
  labels: (string | null | undefined)[],
  fallbackScheme: SurgicalLabelScheme = "letter_number",
): string {
  const existing = labels.filter((l): l is string => !!l);
  const scheme = schemeOfLabels(existing) ?? fallbackScheme;
  if (existing.length === 0) return specimenLabelAt(0, scheme);
  if (scheme === "number_letter") {
    return String(Math.max(0, ...existing.filter(isNumericLabel).map(Number)) + 1);
  }
  const highest = [...existing].sort(compareSpecimenLabels)[existing.length - 1];
  const seq = lettersToSeq(highest);
  return seq === undefined ? String.fromCharCode(highest.charCodeAt(highest.length - 1) + 1) : seqToLetters(seq + 1);
}

/** "A-C" / "1-3" when the labels run without a gap, else "A, C" / "1, 3". */
export function specimenRange(labels: (string | null | undefined)[]): string {
  const sorted = labels.filter((l): l is string => !!l).sort(compareSpecimenLabels);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return sorted[0];
  const toNumber = (l: string) => (isNumericLabel(l) ? Number(l) : lettersToSeq(l));
  const nums = sorted.map(toNumber);
  const isRun = nums.every((n, i) => n !== undefined && (i === 0 || n === (nums[i - 1] as number) + 1));
  return isRun ? `${sorted[0]}-${sorted[sorted.length - 1]}` : sorted.join(", ");
}
