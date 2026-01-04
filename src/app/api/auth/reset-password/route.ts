export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, token, newPassword } = body;
    if (!userId || !token || !newPassword) {
      return NextResponse.json({ success: false, error: "Parametri mancanti" }, { status: 400 });
    }

    // Cerca token
    const authToken = await prisma.authToken.findUnique({ where: { token } });
    if (!authToken || authToken.userId !== userId) {
      return NextResponse.json({ success: false, error: "Token non valido" }, { status: 400 });
    }

    if (authToken.used) {
      return NextResponse.json({ success: false, error: "Token già usato" }, { status: 400 });
    }

    if (authToken.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "Token scaduto" }, { status: 400 });
    }

    // Hash nuova password
    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await prisma.authToken.update({ where: { id: authToken.id }, data: { used: true } });

    return NextResponse.json({ success: true, message: "Password aggiornata" });
  } catch (error) {
    console.error("Errore reset-password:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}
