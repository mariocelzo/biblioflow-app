// API mock per recupero password
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email || "").toLowerCase();
    if (!email) {
      return NextResponse.json({ success: false, error: "Email mancante" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Per sicurezza non riveliamo che l'email non esiste — rispondiamo comunque OK
      return NextResponse.json({ success: true, message: "Se esiste un account verrà inviato un link di reset (mock)" });
    }

    // Genera token persistente per reset password
    const resetToken = Math.random().toString(36).slice(2, 22);
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 ora

    await prisma.authToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        type: "RESET",
        expiresAt: expires,
      },
    });

    const resetLink = `/reset-password?userId=${user.id}&token=${resetToken}`;

    // Log di debug
    console.info(`Reset link per ${email}: ${resetLink}`);

    return NextResponse.json({ success: true, message: "Link di reset generato", data: { resetLink } });
  } catch (error) {
    console.error("Errore recupero-password:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}
