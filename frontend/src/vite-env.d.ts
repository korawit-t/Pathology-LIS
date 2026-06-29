/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // เพิ่มตัวแปรอื่นๆ ใน .env ของคุณที่นี่เพื่อให้มี Auto-complete
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}