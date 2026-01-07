"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BackButton } from "@/components/ui/back-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  BookOpen, 
  MapPin, 
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Filter,
  Building2,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface Libro {
  id: string;
  titolo: string;
  autore: string;
  isbn: string;
  editore: string;
  annoPubblicazione: number;
  categoria: string;
  posizione: string;
  disponibile: boolean;
  copieTotali: number;
  copieDisponibili: number;
  immagineCopertina?: string;
}

// Suggerimento autocomplete
interface Suggerimento {
  tipo: "titolo" | "autore";
  valore: string;
  libro?: Libro;
}

export default function LibriPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Stati
  const [libri, setLibri] = useState<Libro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("TUTTE");
  const [disponibilitaFiltro, setDisponibilitaFiltro] = useState<string>("TUTTE");
  const [posizioneFiltro, setPosizioneFiltro] = useState<string>("TUTTE");
  
  // Autocomplete
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[]>([]);
  const [showSuggerimenti, setShowSuggerimenti] = useState(false);
  const [loadingSuggerimenti, setLoadingSuggerimenti] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  const categorie = [
    "TUTTE",
    "Narrativa",
    "Saggistica",
    "Scienze",
    "Tecnologia",
    "Storia",
    "Arte",
    "Filosofia",
    "Psicologia",
    "Economia",
  ];

  // Posizioni uniche estratte dai libri
  const posizioni = ["TUTTE", ...Array.from(new Set(libri.map(l => l.posizione).filter(Boolean)))];

  // Chiudi suggerimenti quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggerimenti(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Genera suggerimenti autocomplete
  const generaSuggerimenti = useCallback((query: string, libriList: Libro[]): Suggerimento[] => {
    if (!query || query.length < 2) return [];
    
    const queryLower = query.toLowerCase();
    const risultati: Suggerimento[] = [];
    const titoliVisti = new Set<string>();
    const autoriVisti = new Set<string>();
    
    for (const libro of libriList) {
      // Suggerimenti titolo
      if (libro.titolo.toLowerCase().includes(queryLower) && !titoliVisti.has(libro.titolo)) {
        titoliVisti.add(libro.titolo);
        risultati.push({ tipo: "titolo", valore: libro.titolo, libro });
        if (risultati.length >= 8) break;
      }
      
      // Suggerimenti autore
      if (libro.autore.toLowerCase().includes(queryLower) && !autoriVisti.has(libro.autore)) {
        autoriVisti.add(libro.autore);
        risultati.push({ tipo: "autore", valore: libro.autore });
        if (risultati.length >= 8) break;
      }
    }
    
    return risultati.slice(0, 8);
  }, []);

  // Debounced search per autocomplete
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (value.length < 2) {
      setSuggerimenti([]);
      setShowSuggerimenti(false);
      return;
    }
    
    setLoadingSuggerimenti(true);
    debounceRef.current = setTimeout(() => {
      const nuoviSuggerimenti = generaSuggerimenti(value, libri);
      setSuggerimenti(nuoviSuggerimenti);
      setShowSuggerimenti(nuoviSuggerimenti.length > 0);
      setLoadingSuggerimenti(false);
    }, 150);
  };

  // Seleziona suggerimento
  const handleSelectSuggerimento = (suggerimento: Suggerimento) => {
    setSearchQuery(suggerimento.valore);
    setShowSuggerimenti(false);
    
    if (suggerimento.tipo === "titolo" && suggerimento.libro) {
      // Vai direttamente al dettaglio libro
      router.push(`/libri/${suggerimento.libro.id}`);
    }
  };

  // Fetch libri
  useEffect(() => {
    fetchLibri();
  }, []);

  const fetchLibri = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/libri");
      if (!response.ok) throw new Error("Errore nel caricamento");
      
      const result = await response.json();
      console.log("Dati ricevuti da API:", result);
      
      // L'API restituisce { success, data, pagination }
      if (result.success && result.data) {
        setLibri(result.data);
      } else {
        setLibri([]);
      }
    } catch (error) {
      console.error("Errore fetch libri:", error);
      toast.error("Impossibile caricare i libri");
      setLibri([]); // Assicura che sia sempre un array
    } finally {
      setLoading(false);
    }
  };

  // Filtra libri
  const libriFiltrati = libri.filter((libro) => {
    // Filtro ricerca
    const matchSearch = searchQuery === "" || 
      libro.titolo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      libro.autore.toLowerCase().includes(searchQuery.toLowerCase()) ||
      libro.isbn.includes(searchQuery);
    
    // Filtro categoria
    const matchCategoria = categoriaFiltro === "TUTTE" || libro.categoria === categoriaFiltro;
    
    // Filtro disponibilità
    const matchDisponibilita = 
      disponibilitaFiltro === "TUTTE" ||
      (disponibilitaFiltro === "DISPONIBILI" && libro.disponibile) ||
      (disponibilitaFiltro === "NON_DISPONIBILI" && !libro.disponibile);
    
    // Filtro posizione
    const matchPosizione = posizioneFiltro === "TUTTE" || libro.posizione === posizioneFiltro;
    
    return matchSearch && matchCategoria && matchDisponibilita && matchPosizione;
  });

  // Handler richiesta prestito
  const handleRichiestaPrestito = async (libroId: string) => {
    if (status !== "authenticated") {
      toast.error("Effettua il login per richiedere un prestito");
      router.push("/login");
      return;
    }

    try {
      const response = await fetch("/api/prestiti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libroId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Errore nella richiesta");
      }

      toast.success("Richiesta prestito inviata! Il libro sarà pronto tra 15 minuti.");
      fetchLibri(); // Ricarica per aggiornare disponibilità
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore nella richiesta di prestito";
      toast.error(message);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 dark:from-gray-900 dark:to-gray-950">
        <Header />
        <main className="container mx-auto px-4 py-6 max-w-7xl">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-12 w-full mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 dark:from-gray-900 dark:to-gray-950">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header con BackButton */}
        <div className="flex items-center gap-3 mb-6">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Catalogo Libri</h1>
            <p className="text-sm text-muted-foreground">
              {libriFiltrati.length} {libriFiltrati.length === 1 ? "libro trovato" : "libri trovati"}
            </p>
          </div>
        </div>

        {/* Barra ricerca e filtri */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardContent className="p-6 space-y-4">
            {/* Ricerca con autocomplete */}
            <div className="relative" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
              {loadingSuggerimenti && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Input
                type="text"
                placeholder="Cerca per titolo, autore o ISBN..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchQuery.length >= 2 && suggerimenti.length > 0 && setShowSuggerimenti(true)}
                className="pl-10 h-12 text-base"
              />
              
              {/* Dropdown suggerimenti */}
              {showSuggerimenti && suggerimenti.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  {suggerimenti.map((sugg, index) => (
                    <button
                      key={`${sugg.tipo}-${index}`}
                      onClick={() => handleSelectSuggerimento(sugg)}
                      className="w-full px-4 py-3 text-left hover:bg-muted flex items-center gap-3 border-b border-border last:border-b-0 transition-colors"
                    >
                      {sugg.tipo === "titolo" ? (
                        <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                      ) : (
                        <User className="h-4 w-4 text-green-500 dark:text-green-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-foreground">{sugg.valore}</p>
                        <p className="text-xs text-muted-foreground">
                          {sugg.tipo === "titolo" ? "Vai al libro →" : "Cerca per autore"}
                        </p>
                      </div>
                      {sugg.tipo === "titolo" && sugg.libro && (
                        <Badge variant={sugg.libro.disponibile ? "default" : "secondary"} className="flex-shrink-0">
                          {sugg.libro.disponibile ? "Disponibile" : "Non disponibile"}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filtri */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                  <SelectTrigger className="h-10">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      <SelectValue placeholder="Categoria" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {categorie.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Select value={disponibilitaFiltro} onValueChange={setDisponibilitaFiltro}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Disponibilità" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TUTTE">Tutte</SelectItem>
                    <SelectItem value="DISPONIBILI">Solo disponibili</SelectItem>
                    <SelectItem value="NON_DISPONIBILI">Non disponibili</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Select value={posizioneFiltro} onValueChange={setPosizioneFiltro}>
                  <SelectTrigger className="h-10">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <SelectValue placeholder="Posizione" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {posizioni.map((pos) => (
                      <SelectItem key={pos} value={pos}>
                        {pos === "TUTTE" ? "Tutte le posizioni" : pos}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(searchQuery || categoriaFiltro !== "TUTTE" || disponibilitaFiltro !== "TUTTE" || posizioneFiltro !== "TUTTE") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setCategoriaFiltro("TUTTE");
                    setDisponibilitaFiltro("TUTTE");
                    setPosizioneFiltro("TUTTE");
                    setSuggerimenti([]);
                    setShowSuggerimenti(false);
                  }}
                  className="h-10"
                >
                  Reset filtri
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lista libri */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        ) : libriFiltrati.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nessun libro trovato</h3>
              <p className="text-muted-foreground max-w-md">
                Prova a modificare i filtri o la ricerca per trovare altri libri
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {libriFiltrati.map((libro) => (
              <Link href={`/libri/${libro.id}`} key={libro.id}>
                <Card 
                  className="
                    group relative overflow-hidden
                    border-0 shadow-lg hover:shadow-xl
                    transition-all duration-300 ease-out
                    hover:-translate-y-1 cursor-pointer h-full
                  "
                >
                <CardHeader className="pb-3">
                  {/* Badge categoria e disponibilità */}
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {libro.categoria}
                    </Badge>
                    {libro.disponibile ? (
                      <Badge className="bg-green-500 text-white text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Disponibile
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        <XCircle className="h-3 w-3 mr-1" />
                        Non disponibile
                      </Badge>
                    )}
                  </div>

                  {/* Titolo e autore */}
                  <CardTitle className="text-lg line-clamp-2 min-h-[3.5rem]">
                    {libro.titolo}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {libro.autore}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Info libro */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ISBN:</span>
                      <span className="font-mono">{libro.isbn}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Editore:</span>
                      <span>{libro.editore}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Anno:</span>
                      <span>{libro.annoPubblicazione}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Posizione:</span>
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <MapPin className="h-4 w-4" />
                        {libro.posizione}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Copie:</span>
                      <span className="font-medium">
                        {libro.copieDisponibili} / {libro.copieTotali}
                      </span>
                    </div>
                  </div>

                  {/* Pulsante azione */}
                  <Button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRichiestaPrestito(libro.id);
                    }}
                    disabled={!libro.disponibile || status !== "authenticated"}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                  >
                    {status !== "authenticated" ? (
                      "Accedi per richiedere"
                    ) : !libro.disponibile ? (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        Non disponibile
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-4 w-4 mr-2" />
                        Richiedi Prestito
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
