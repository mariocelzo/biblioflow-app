// API mock per verifica email (simulata)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth-tokens";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const token = url.searchParams.get("token");

    if (!userId || !token) {
      return NextResponse.json({ success: false, error: "Parametri mancanti" }, { status: 400 });
    }

    // Verifica token persistente.
    // Nel database e' salvato solo il digest SHA-256 del token (finding C-2):
    // ricalcoliamo l'hash del valore arrivato nella query string e cerchiamo
    // quello. La lookup resta una uguaglianza esatta sull'indice unico.
    const authToken = await prisma.authToken.findUnique({
      where: { token: hashToken(token) },
    });
    if (!authToken || authToken.userId !== userId) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 400 });
    }

    if (authToken.used) {
      return NextResponse.json({ success: false, error: "Token già usato" }, { status: 400 });
    }

    if (authToken.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "Token scaduto" }, { status: 400 });
    }

    // Marca email verificata e token come usato
    await prisma.user.update({ where: { id: userId }, data: { emailVerificata: true } });
    await prisma.authToken.update({ where: { id: authToken.id }, data: { used: true } });

    return NextResponse.json({ success: true, message: "Email verificata" });
  } catch (error) {
    console.error("Errore verify:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}
