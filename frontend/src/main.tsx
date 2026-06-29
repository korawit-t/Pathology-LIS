import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// 1. เพิ่มการเช็ค Null สำหรับ Element 'root'
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    "Failed to find the root element. Make sure there is a div with id 'root' in your index.html",
  );
}

// 2. ใช้ createRoot พร้อมระบุว่า rootElement ไม่เป็น null แน่นอน
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
