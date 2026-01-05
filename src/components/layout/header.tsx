// ============================================
// HEADER COMPONENT - BiblioFlow
// ============================================
// Header con stato autenticazione dinamico
// Mostra Login/Registrati se non autenticato
// Mostra nome utente e menu se autenticato

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { 
  BookOpen, 
  LogIn, 
  UserPlus, 
  User, 
  LogOut, 
  Calendar,
  BookMarked,
  Menu,
  Bell
} from "lucide-react";

export function Header() {
  const { data: session, status } = useSession();
  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";
  
  // Stato per il contatore notifiche non lette
  const [notificheNonLette, setNotificheNonLette] = useState(0);
  
  // Fetch contatore notifiche
  useEffect(() => {
    const fetchNotificheCount = async () => {
      if (!session?.user?.id) return;
      try {
        const res = await fetch(`/api/notifiche?userId=${session.user.id}&letta=false`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
          },
        });
        if (res.ok) {
          const data = await res.json();
          setNotificheNonLette(data.nonLette || 0);
        }
      } catch (error) {
        console.error("Errore fetch notifiche:", error);
      }
    };
    
    if (status === "authenticated") {
      fetchNotificheCount();
      // Aggiorna ogni 60 secondi
      const interval = setInterval(fetchNotificheCount, 60000);
      return () => clearInterval(interval);
    }
  }, [session?.user?.id, status]);

  // Ottieni le iniziali per l'avatar
  const getInitials = () => {
    if (!session?.user) return "?";
    const nome = session.user.nome || "";
    const cognome = session.user.cognome || "";
    return `${nome.charAt(0)}${cognome.charAt(0)}`.toUpperCase();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        {/* Logo e nome app */}
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="hidden sm:inline">BiblioFlow</span>
        </Link>

        {/* Navigazione centrale (visibile su desktop) */}
        {isAuthenticated && (
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/prenota" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Prenota Posto
            </Link>
            <Link 
              href="/prestiti" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              I Miei Prestiti
            </Link>
            <Link 
              href="/prenotazioni" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Le Mie Prenotazioni
            </Link>
          </nav>
        )}

        {/* Sezione destra: Auth */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            // Skeleton durante il caricamento
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
          ) : isAuthenticated ? (
            // Utente autenticato: mostra notifiche, theme toggle e avatar
            <>
              {/* Icona Notifiche */}
              <Link href="/notifiche">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {notificheNonLette > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs"
                    >
                      {notificheNonLette > 99 ? "99+" : notificheNonLette}
                    </Badge>
                  )}
                </Button>
              </Link>
              
              {/* Toggle Tema */}
              <ThemeToggle />
              
              {/* Menu Utente */}
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium">
                    {session?.user?.nome}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">
                      {session?.user?.nome} {session?.user?.cognome}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session?.user?.email}
                    </p>
                    {session?.user?.isPendolare && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        🚂 Pendolare
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Link mobile (visibili solo su mobile) */}
                <div className="md:hidden">
                  <DropdownMenuItem asChild>
                    <Link href="/prenota" className="cursor-pointer">
                      <Calendar className="mr-2 h-4 w-4" />
                      Prenota Posto
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/prestiti" className="cursor-pointer">
                      <BookMarked className="mr-2 h-4 w-4" />
                      I Miei Prestiti
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/prenotazioni" className="cursor-pointer">
                      <Calendar className="mr-2 h-4 w-4" />
                      Le Mie Prenotazioni
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </div>

                <DropdownMenuItem asChild>
                  <Link href="/profilo" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Il Mio Profilo
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="cursor-pointer text-red-600 dark:text-red-400"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Esci
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            // Utente non autenticato: mostra theme toggle, Login e Registrati
            <>
              <ThemeToggle />
              <Button variant="ghost" asChild className="hidden sm:flex">
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  Accedi
                </Link>
              </Button>
              <Button asChild>
                <Link href="/registrazione">
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Registrati</span>
                  <span className="sm:hidden">Registrati</span>
                </Link>
              </Button>
              {/* Menu hamburger per mobile quando non autenticato */}
              <Button variant="ghost" size="icon" className="sm:hidden" asChild>
                <Link href="/login">
                  <Menu className="h-5 w-5" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
