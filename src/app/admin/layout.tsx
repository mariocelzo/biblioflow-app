import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

// PERCHE': senza questo, tutte le pagine sotto /admin mostravano in scheda
// solo l'URL ("localhost:3000/admin"), perche' nessuna esportava un
// `<title>`. Il template applica automaticamente "· BiblioFlow" (stesso
// stile di /accessibilita e della pagina 404) a ogni titolo impostato dalle
// singole pagine figlie; `default` copre le pagine che non ne impostano uno
// proprio (es. le sottopagine client-only che non possono esportare metadata).
export const metadata: Metadata = {
  title: {
    template: "%s · BiblioFlow",
    default: "Amministrazione · BiblioFlow",
  },
  description: "Pannello di amministrazione di BiblioFlow per bibliotecari e staff.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Proteggi le route admin
  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <AdminSidebar className="hidden md:flex" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <div className="flex md:hidden items-center justify-between h-16 px-4 border-b bg-card">
          <h1 className="text-lg font-bold">BiblioFlow Admin</h1>
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
