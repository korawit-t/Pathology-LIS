// ─── Case-type brand colors ───────────────────────────────────────────────────
// Change here → propagates to AccessionTag, section headers, type badges, etc.
export const CASE_TYPE_COLOR = {
  surgical: "#1890ff",   // blue
  gyne:     "#52c41a",   // green
  nongyne:  "#fa8c16",   // orange
} as const;

// Accession prefix → color (mirrors CASE_TYPE_COLOR by letter prefix)
export const ACCESSION_PREFIX_COLOR: Record<string, string> = {
  S: CASE_TYPE_COLOR.surgical,
  C: CASE_TYPE_COLOR.gyne,
  N: CASE_TYPE_COLOR.nongyne,
};

// ─── Workflow / pipeline stage colors ─────────────────────────────────────────
export const WORKFLOW_COLOR = {
  registered:      "#595959",
  fixation:        "#52c41a",
  grossing:        "#722ed1",
  tissueProcess:   "#1890ff",
  decal:           "#faad14",
  embedding:       "#13c2c2",
  sectioning:      "#fa8c16",
  staining:        "#eb2f96",
  slideDispatch:   "#52c41a",
  diagnosis:       "#1890ff",
  published:       "#52c41a",
} as const;

// ─── Status tag colors (used across all case-type tables) ─────────────────────
export const STATUS_COLOR: Record<string, string> = {
  registered:       "default",
  formalin_fixing:  "green",
  in_progress:      "purple",
  grossed:          "blue",
  processed:        "cyan",
  embedded:         "geekblue",
  sectioned:        "orange",
  stained:          "purple",
  slide_sent:       "blue",
  published:        "success",
  pending_approval: "gold",
  cancelled:        "error",
  screening:        "geekblue",
  screened:         "geekblue",
  reported:         "green",
  revised:          "volcano",
};

// ─── UI element colors ─────────────────────────────────────────────────────────
export const UI_COLOR = {
  iconDefault:   "#595959",   // standard icon / title icon
  linkText:      "#1890ff",
  danger:        "#ff4d4f",
  warning:       "#faad14",
  success:       "#52c41a",
  info:          "#1890ff",
} as const;
