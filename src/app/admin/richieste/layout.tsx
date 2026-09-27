import type { Metadata } from "next";

// PERCHE' QUESTO FILE: src/app/admin/richieste/page.tsx e' un Client
// Component ("use client": usa useState/useEffect per caricare le richieste
// via fetch), e un Client Component non puo' esportare `metadata`
// direttamente. Stesso identico caso di src/app/admin/scanner/layout.tsx: un
// piccolo layout Server Component che si limita a dichiarare il titolo e
// passare i figli, senza toccare la logica della pagina.
//
// PRIMA: questa pagina non esportava alcun `metadata`, quindi ereditava il
// `default` di src/app/admin/layout.tsx ("Amministrazione · BiblioFlow"),
// uguale per qualunque pagina admin priva di titolo proprio — la scheda del
// browser non diceva quale sezione dell'area admin fosse aperta.
export const metadata: Metadata = {
  title: "Gestione richieste",
};

export default function RichiesteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
