import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Dati mock per la demo
const mockUser = {
  nome: "Marco",
  cognome: "Ferretti",
  prenotazioneAttiva: {
    posto: "15B",
    sala: "Sala Silenziosa",
    oraInizio: "08:30",
    oraFine: "12:30",
    checkInEntro: 45, // minuti
  },
};

const mockStats = {
  postiDisponibili: 42,
  prenotazioniAttive: 1,
  percentualeOccupazione: 73,
};

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--primary)] text-white shadow-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">BiblioFlow</h1>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="bg-white/20 text-white">
              {mockStats.postiDisponibili} posti liberi
            </Badge>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-sm font-medium">MF</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 pb-24">
        {/* Saluto */}
        <section className="mb-6">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">
            Ciao {mockUser.nome}! 👋
          </h2>
          <p className="text-[var(--gray-500)]">Cosa vuoi fare oggi?</p>
        </section>

        {/* Prenotazione Attiva */}
        {mockUser.prenotazioneAttiva && (
          <Card className="mb-6 border-[var(--primary)] border-l-4 bg-[var(--primary-light)]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-[var(--primary)]">
                  Prenotazione Attiva
                </CardTitle>
                <Badge className="bg-[var(--success)] text-white">
                  Check-in tra {mockUser.prenotazioneAttiva.checkInEntro} min
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-medium">
                Posto {mockUser.prenotazioneAttiva.posto} - {mockUser.prenotazioneAttiva.sala}
              </p>
              <p className="text-sm text-[var(--gray-600)]">
                {mockUser.prenotazioneAttiva.oraInizio} - {mockUser.prenotazioneAttiva.oraFine}
              </p>
              <div className="flex gap-2 mt-4">
                <Button size="sm" className="bg-[var(--primary)]">
                  Vai al Check-in
                </Button>
                <Button size="sm" variant="outline">
                  Vedi Percorso
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <section className="grid grid-cols-2 gap-4 mb-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="w-12 h-12 rounded-lg bg-[var(--primary)] flex items-center justify-center mb-2">
                <span className="text-2xl text-white">+</span>
              </div>
              <CardTitle className="text-base">Prenota Posto</CardTitle>
              <CardDescription>{mockStats.postiDisponibili} disponibili</CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="w-12 h-12 rounded-lg bg-[var(--success)] flex items-center justify-center mb-2">
                <span className="text-2xl text-white">✓</span>
              </div>
              <CardTitle className="text-base">Prenotazioni</CardTitle>
              <CardDescription>{mockStats.prenotazioniAttive} attiva</CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="w-12 h-12 rounded-lg bg-[var(--warning)] flex items-center justify-center mb-2">
                <span className="text-2xl">🔍</span>
              </div>
              <CardTitle className="text-base">Cerca Libro</CardTitle>
              <CardDescription>Catalogo</CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="w-12 h-12 rounded-lg bg-[var(--gray-400)] flex items-center justify-center mb-2">
                <span className="text-2xl text-white">⚙</span>
              </div>
              <CardTitle className="text-base">Profilo</CardTitle>
              <CardDescription>Impostazioni</CardDescription>
            </CardHeader>
          </Card>
        </section>

        {/* Stats */}
        <section>
          <h3 className="text-lg font-semibold mb-3">Stato Biblioteca</h3>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--gray-500)]">Occupazione</p>
                  <p className="text-2xl font-bold text-[var(--primary)]">
                    {mockStats.percentualeOccupazione}%
                  </p>
                </div>
                <div className="w-24 h-24 relative">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="none"
                      stroke="var(--gray-200)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="8"
                      strokeDasharray={`${mockStats.percentualeOccupazione * 2.51} 251`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--gray-200)] py-2 px-4">
        <div className="container mx-auto flex justify-around">
          <NavItem icon="🏠" label="Home" active />
          <NavItem icon="🗺️" label="Mappa" />
          <NavItem icon="📚" label="Libri" />
          <NavItem icon="👤" label="Profilo" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: string; label: string; active?: boolean }) {
  return (
    <button
      className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
        active 
          ? "text-[var(--primary)] bg-[var(--primary-light)]" 
          : "text-[var(--gray-500)] hover:bg-[var(--gray-100)]"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
