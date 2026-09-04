"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink
} from "lucide-react";
import { getTipoConfig } from "./tipo-config";
import { isSafeInternalPath } from "@/lib/safe-redirect";

interface Notifica {
  id: string;
  tipo: string; // Supporta sia tipi storici che nuovi (es. CODA_INGRESSO, ALERT, ecc.)
  titolo: string;
  messaggio: string;
  actionUrl?: string;
  actionLabel?: string;
  letta: boolean;
  lettaAt?: string;
  createdAt: string;
}

export default function NotifichePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonLette, setNonLette] = useState(0);
  const [tabAttiva, setTabAttiva] = useState("tutte");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchNotifiche = async () => {
      if (!session?.user?.id) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ userId: session.user.id });
        if (tabAttiva === "non-lette") params.append("letta", "false");
        if (tabAttiva === "lette") params.append("letta", "true");
        
        const res = await fetch(`/api/notifiche?${params}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
          },
        });
        if (res.ok) {
          const data = await res.json();
          console.log("📥 Notifiche caricate:", data.nonLette, "non lette");
          setNotifiche(data.data || []);
          setNonLette(data.nonLette || 0);
        }
      } catch (err) {
        console.error("Errore caricamento notifiche:", err);
        toast.error("Errore nel caricamento delle notifiche");
      } finally {
        setLoading(false);
      }
    };
    if (status === "authenticated") fetchNotifiche();
  }, [session?.user?.id, status, tabAttiva]);

  const segnaComeLetta = async (id: string) => {
    try {
      const res = await fetch("/api/notifiche", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], segnaLetta: true }),
        cache: "no-store",
      });
      
      if (res.ok) {
        const result = await res.json();
        console.log("✅ Notifica segnata come letta:", result);
        setNotifiche(prev => prev.map(n => 
          n.id === id ? { ...n, letta: true, lettaAt: new Date().toISOString() } : n
        ));
        setNonLette(prev => Math.max(0, prev - 1));
        toast.success("Notifica segnata come letta");
      } else {
        console.error("❌ Errore API:", await res.text());
        toast.error("Errore nell'aggiornamento");
      }
    } catch (error) {
      console.error("❌ Errore:", error);
      toast.error("Errore nell'aggiornamento");
    }
  };

  const segnaTutteComeLette = async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch("/api/notifiche", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id, segnaTutteLette: true }),
        cache: "no-store",
      });
      
      if (res.ok) {
        setNotifiche(prev => prev.map(n => ({ ...n, letta: true, lettaAt: new Date().toISOString() })));
        setNonLette(0);
        toast.success("Tutte le notifiche segnate come lette");
      } else {
        toast.error("Errore nell'operazione");
      }
    } catch (err) {
      console.error("Errore:", err);
      toast.error("Errore nell'operazione");
    }
  };

  const eliminaNotifica = async (id: string) => {
    try {
      const res = await fetch(`/api/notifiche?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        const notificaEliminata = notifiche.find(n => n.id === id);
        setNotifiche(prev => prev.filter(n => n.id !== id));
        if (notificaEliminata && !notificaEliminata.letta) {
          setNonLette(prev => Math.max(0, prev - 1));
        }
        toast.success("Notifica eliminata");
      }
    } catch (err) {
      console.error("Errore:", err);
      toast.error("Errore nell'eliminazione");
    }
  };

  const formatData = (data: string) => {
    const d = new Date(data);
    const oggi = new Date();
    const ieri = new Date(oggi);
    ieri.setDate(ieri.getDate() - 1);
    
    if (d.toDateString() === oggi.toDateString()) {
      return `Oggi, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (d.toDateString() === ieri.toDateString()) {
      return `Ieri, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString("it-IT", { 
      day: "numeric", 
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <BackButton />
        
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Notifiche</h1>
              <p className="text-muted-foreground">
                {nonLette > 0 ? `${nonLette} non lette` : "Nessuna notifica non letta"}
              </p>
            </div>
          </div>
          
          {nonLette > 0 && (
            <Button variant="outline" size="sm" onClick={segnaTutteComeLette}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Segna tutte come lette
            </Button>
          )}
        </div>

        <Tabs value={tabAttiva} onValueChange={setTabAttiva}>
          <TabsList className="mb-6">
            <TabsTrigger value="tutte" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Tutte
            </TabsTrigger>
            <TabsTrigger value="non-lette" className="flex items-center gap-2">
              <BellOff className="h-4 w-4" />
              Non lette
              {nonLette > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                  {nonLette}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="lette" className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              Lette
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tabAttiva}>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : notifiche.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    {tabAttiva === "non-lette" 
                      ? "Nessuna notifica non letta" 
                      : tabAttiva === "lette"
                      ? "Nessuna notifica letta"
                      : "Nessuna notifica"
                    }
                  </h3>
                  <p className="text-muted-foreground">
                    {tabAttiva === "non-lette" 
                      ? "Sei in pari con tutte le notifiche!" 
                      : "Le notifiche appariranno qui"
                    }
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {notifiche.map((notifica) => (
                  <Card 
                    key={notifica.id} 
                    className={`transition-all hover:shadow-md ${
                      !notifica.letta ? "border-l-4 border-l-blue-500 bg-blue-50/30" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="flex-shrink-0 mt-1">
                          <div className="h-10 w-10 rounded-full bg-card dark:bg-gray-700 border flex items-center justify-center">
                            {getTipoConfig(notifica.tipo).icona}
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`font-medium ${!notifica.letta ? "text-foreground" : "text-muted-foreground"}`}>
                                {notifica.titolo}
                              </h3>
                              <Badge variant="secondary" className={`text-xs ${getTipoConfig(notifica.tipo).colore}`}>
                                {getTipoConfig(notifica.tipo).label}
                              </Badge>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatData(notifica.createdAt)}
                            </span>
                          </div>
                          
                          <p className={`mt-1 text-sm ${!notifica.letta ? "text-gray-700" : "text-gray-500"}`}>
                            {notifica.messaggio}
                          </p>
                          
                          <div className="flex items-center gap-2 mt-3">
                            {notifica.actionUrl && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  segnaComeLetta(notifica.id);
                                  // B-8: actionUrl arriva dal DB e potrebbe
                                  // essere stato manomesso. Navighiamo solo se
                                  // e' un percorso interno sicuro; altrimenti
                                  // fallback alla pagina notifiche.
                                  if (isSafeInternalPath(notifica.actionUrl)) {
                                    router.push(notifica.actionUrl!);
                                  } else {
                                    router.push("/notifiche");
                                  }
                                }}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                {notifica.actionLabel || "Vai"}
                              </Button>
                            )}
                            
                            {!notifica.letta && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => segnaComeLetta(notifica.id)}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Segna come letta
                              </Button>
                            )}
                            
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                              onClick={() => eliminaNotifica(notifica.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
