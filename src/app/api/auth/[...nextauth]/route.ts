// ============================================
// AUTH API ROUTE HANDLER
// ============================================
// Gestisce tutte le route di autenticazione:
// - GET/POST /api/auth/[...nextauth]

// Forza Node.js runtime (bcryptjs e prisma non funzionano su Edge)
export const runtime = "nodejs";

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
