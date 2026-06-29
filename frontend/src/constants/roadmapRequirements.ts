// src/constants/roadmapRequirements.ts

export interface RoadmapRequirement {
  label: string;
  done: boolean;
}

export const ROADMAP_REQUIREMENTS: RoadmapRequirement[] = [
  { label: "ลงทะเบียนผู้ป่วย Manual", done: true },
  { label: "ลงทะเบียน: Specimen manual", done: true },
  { label: "ลงทะเบียน: Sticker", done: true },
  { label: "Gross: บันทึก Gross", done: true },
  { label: "Gross: Block", done: true },
  { label: "Gross: Image", done: true },
  { label: "Frontend: Gross Examination - UI Block Table", done: true },
  { label: "Backend: Fix 405 Method Not Allowed (PUT/PATCH)", done: true },
  { label: "Frontend: Decal Management Modal", done: true },
  {
    label: "Frontend: Optimized Surgical & Gross Tables (Server Pagination)",
    done: true,
  },

  { label: "Backend: Holiday Management & Master Data", done: true },
  {
    label: "Calculation: TAT Business Days Logic (Exclude Weekends/Holidays)",
    done: true,
  },

  /* --- Pending / In Progress --- */
  {
    label: "TAT: Urgent Case SLA Configuration (แยกเป้าหมายเคสด่วน)",
    done: false,
  },
  {
    label:
      "Protocol Set: ระบบชุดคำสั่งย้อมพิเศษ (Immuno/Special Stains Grouping)",
    done: false,
  },

  {
    label:
      "Settings: Toggle Specimen Name in Report Head (e.g., A: Appendix vs A:)",
    done: false,
  },
  { label: "Settings: Enable/Disable Approval Workflow", done: false },
  { label: "Server Pagination: Surgical Block)", done: false },
  { label: "Server Pagination: Tissue Embedding", done: false },
  { label: "Server Pagination: Sectioning", done: false },
  { label: "Server Pagination: Staining", done: false },
  { label: "Report: Generate PDF for Surgical Report", done: false },
  { label: "Dashboard: สรุปสถิติเคสประจำวัน", done: false },
  { label: "ลงทะเบียนดึงข้อมูลจาก HIS", done: false },
  { label: "แนบใบ request (PDF/JPG)", done: false },
] as const;
