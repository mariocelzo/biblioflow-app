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
  BookOpen, 
  Calendar, 
  Check, 
  CheckCheck, 
  Clock,
  Info,
  Megaphone,
  Trash2,
  ExternalLink
} from "lucide-react";

interface Notifica {
  id: string;
  tipo: "PRENOTAZIONE" | "CHECK_IN_REMINDER" | "SCADENZA_PRESTITO" | "SISTEMA" | "PROMO";
  titolo: string;
  messaggio: string;
  actionUrl?: string;
  actionLabel?: string;
  letta: boolean;
  lettaAt?: string;
  createdAt: string;
}

const ICONE_TIPO: Record<string, React.ReactNode> = {
  PRENOTAZIONE: <Calendar className="h-5 w-5 text-blue-500" />,
  CHECK_IN_REMINDER: <Clock className="h-5 w-5 text-orange-500" />,
  SCADENZA_PRESTITO: <BookOpen className="h-5 w-5 text-red-500" />,
  SISTEMA: <Info className="h-5 w-5 text-gray-500" />,
  PROMO: <Megaphone className="h-5 w-5 text-purple-500" />,
};

const COLORI_TIPO: Record<string, string> = {
  PRENOTAZIONE: "bg-blue-100 text-blue-800",
  CHECK_IN_REMINDER: "bg-orange-100 text-orange-800",
  SCADENZA_PRESTITO: "bg-red-100 text-red-800",
  SISTEMA: "bg-gray-100 text-gray-800",
  PROMO: "bg-purple-100 text-purple-800",
};

const LABELS_TIPO: Record<string, string> = {
  PRENOTAZIONE: "Prenotazione",
  CHECK_IN_REMINDER: "Check-in",
  SCADENZA_PRESTITO: "Prestito",
  SISTEMA: "Sistema",
  PROMO: "Promozione",
};

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
        
        const res = await fetch(`/api/notifiche?${params}`);
        if (res.ok) {
          const data = await res.json();
          setNotifiche(data.data || []);
          setNonLette(data.nonLette || 0);
        }
      } catch (error) {
        console.error("Errore caricamento notifiche:", error);
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
      });
      
      if (res.ok) {
        setNotifiche(prev => prev.map(n => 
          n.id === id ? { ...n, letta: true, lettaAt: new Date().toISOString() } : n
        ));
        setNonLette(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const segnaTutteComeLette = async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch("/api/notifiche", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id, segnaTutteLette: true }),
      });
      
      if (res.ok) {
        setNotifiche(prev => prev.map(n => ({ ...n, letta: true, lettaAt: new Date().toISOString() })));
        setNonLette(0);
        toast.success("Tutte le notifiche segnate come lette");
      }
    } catch (error) {
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
    } catch (error) {
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
            <Bell className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notifiche</h1>
              <p className="text-gray-500">
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
                  <Bell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {tabAttiva === "non-lette" 
                      ? "Nessuna notifica non letta" 
                      : tabAttiva === "lette"
                      ? "Nessuna notifica letta"
                      : "Nessuna notifica"
                    }
                  </h3>
                  <p className="text-gray-500">
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
                          <div className="h-10 w-10 rounded-full bg-white border flex items-center justify-center">
                            {ICONE_TIPO[notifica.tipo]}
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`font-medium ${!notifica.letta ? "text-gray-900" : "text-gray-700"}`}>
                                {notifica.titolo}
                              </h3>
                              <Badge variant="secondary" className={`text-xs ${COLORI_TIPO[notifica.tipo]}`}>
                                {LABELS_TIPO[notifica.tipo]}
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
                                  router.push(notifica.actionUrl!);
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
