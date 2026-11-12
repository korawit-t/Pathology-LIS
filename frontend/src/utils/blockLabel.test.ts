import { describe, expect, it } from "vitest";
import {
  blockRunNumber,
  compareSpecimenLabels,
  formatBlockCode,
  nextSpecimenLabel,
  schemeOfLabels,
  seqToLetters,
  specimenLabelAt,
  specimenRange,
} from "./blockLabel";

describe("seqToLetters", () => {
  it.each([
    [1, "A"],
    [26, "Z"],
    [27, "AA"],
    [28, "AB"],
    [53, "BA"],
    [702, "ZZ"],
    [703, "AAA"],
  ])("%i -> %s", (n, letters) => {
    expect(seqToLetters(n)).toBe(letters);
  });

  it("returns empty for nothing to letter", () => {
    expect(seqToLetters(0)).toBe("");
  });
});

describe("formatBlockCode", () => {
  it("prefers the backend block_code", () => {
    expect(formatBlockCode({ block_code: "G", block_no: 3, case_block_seq: 7 }, "1")).toBe("G");
  });

  it("uses the case-wide letter when there is no block_code", () => {
    expect(formatBlockCode({ block_no: 3, case_block_seq: 7 }, "1")).toBe("G");
  });

  it("keeps the A1 label for the default scheme", () => {
    expect(formatBlockCode({ block_no: 2, specimen_label: "B" })).toBe("B2");
    expect(formatBlockCode({ block_no: "2" }, "A")).toBe("A2");
  });
});

describe("blockRunNumber", () => {
  it("runs on the case-wide letter when there is one", () => {
    expect(blockRunNumber({ block_no: 1, case_block_seq: 7 })).toBe(7);
    expect(blockRunNumber({ block_no: "3" })).toBe(3);
  });
});

describe("specimen labels", () => {
  it("sorts numbers numerically and letters as before", () => {
    expect(["10", "2", "1", "9"].sort(compareSpecimenLabels)).toEqual(["1", "2", "9", "10"]);
    expect(["C", "A", "B"].sort(compareSpecimenLabels)).toEqual(["A", "B", "C"]);
  });

  it("knows the scheme from existing labels", () => {
    expect(schemeOfLabels(["1", "2"])).toBe("number_letter");
    expect(schemeOfLabels(["A"])).toBe("letter_number");
    expect(schemeOfLabels([])).toBeUndefined();
  });

  it("labels by position", () => {
    expect(specimenLabelAt(0, "letter_number")).toBe("A");
    expect(specimenLabelAt(2, "number_letter")).toBe("3");
  });

  it("follows the case, falling back to the setting only when empty", () => {
    expect(nextSpecimenLabel([], "letter_number")).toBe("A");
    expect(nextSpecimenLabel([], "number_letter")).toBe("1");
    expect(nextSpecimenLabel(["A", "B"], "number_letter")).toBe("C");
    expect(nextSpecimenLabel(["1", "2"], "letter_number")).toBe("3");
    expect(nextSpecimenLabel(["1", "2", "3", "4", "5", "6", "7", "8", "9"])).toBe("10");
    expect(nextSpecimenLabel(["Z"])).toBe("AA");
  });

  it("collapses a run into a range", () => {
    expect(specimenRange(["C", "A", "B"])).toBe("A-C");
    expect(specimenRange(["A", "C"])).toBe("A, C");
    expect(specimenRange(["10", "9", "8"])).toBe("8-10");
    expect(specimenRange(["1", "3"])).toBe("1, 3");
    expect(specimenRange(["B"])).toBe("B");
  });
});
