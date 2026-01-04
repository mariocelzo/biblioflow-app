// ============================================
// SESSION PROVIDER - BiblioFlow
// ============================================
// Wrapper per fornire il contesto di sessione NextAuth
// a tutti i componenti client

"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function SessionProvider({ children }: Props) {
  return (
    <NextAuthSessionProvider>
      {children}
    </NextAuthSessionProvider>
  );
}
