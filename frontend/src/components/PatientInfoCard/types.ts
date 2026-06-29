export type ActiveCaseType = "surgical" | "gyne" | "nongyne";

export interface MarkTarget {
  rowAccession: string;
  rowCaseId: number;
  rowCaseType: "gyne" | "nongyne" | "surgical";
}
