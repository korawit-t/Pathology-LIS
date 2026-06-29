/**
 * 🔖 Title model (อ้างอิงจาก SQLAlchemy)
 * class Title(Base):
 *   id: number
 *   title: string
 */
export interface Title {
  id: number;
  title: string; // เช่น "นาย", "Dr."
}

/**
 * 📦 Payload สำหรับ create / update
 */
export type TitlePayload = Omit<Title, "id">;
