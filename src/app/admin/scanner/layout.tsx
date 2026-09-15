import type { Metadata } from "next";

// PERCHE' QUESTO FILE: src/app/admin/scanner/page.tsx e' un Client
// Component (usa hook e la libreria dello scanner QR), e un Client
// Component non puo' esportare `metadata` direttamente. Come per
// src/app/accessibilita/page.tsx + pannello-accessibilita.tsx, basta un
// piccolo layout Server Component che si limita a dichiarare il titolo e
// passare i figli, senza toccare la logica dello scanner.
export const metadata: Metadata = {
  title: "Scanner QR check-in",
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
