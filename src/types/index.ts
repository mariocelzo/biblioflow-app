// ============================================
// BIBLIOFLOW - TIPI TYPESCRIPT
// ============================================

// I tipi Prisma saranno disponibili dopo `npx prisma generate`
// Per ora definiamo i tipi manualmente

// ============================================
// ENUMS
// ============================================

export type UserRole = 'STUDENTE' | 'BIBLIOTECARIO' | 'ADMIN';

export type StatoPosto = 'DISPONIBILE' | 'OCCUPATO' | 'MANUTENZIONE' | 'RISERVATO';

export type StatoPrenotazione = 'CONFERMATA' | 'CHECK_IN' | 'COMPLETATA' | 'CANCELLATA' | 'NO_SHOW' | 'SCADUTA';

export type StatoPrestito = 'ATTIVO' | 'RESTITUITO' | 'SCADUTO' | 'RINNOVATO';

export type TipoNotifica = 'PRENOTAZIONE' | 'CHECK_IN_REMINDER' | 'SCADENZA_PRESTITO' | 'SISTEMA' | 'PROMO';

export type TipoEvento = 'PRENOTAZIONE_CREATA' | 'PRENOTAZIONE_CANCELLATA' | 'CHECK_IN' | 'CHECK_OUT' | 'NO_SHOW' | 'PRESTITO_CREATO' | 'PRESTITO_RESTITUITO' | 'OVERRIDE_BIBLIOTECARIO';

// ============================================
// MODELLI BASE
// ============================================

export interface User {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  matricola?: string | null;
  ruolo: UserRole;
  isPendolare: boolean;
  tragittoPendolare?: string | null;
  postoPreferito?: string | null;
  salaPreferita?: string | null;
  necessitaAccessibilita: boolean;
  preferenzeAccessibilita?: string | null;
  altoContrasto: boolean;
  notifichePush: boolean;
  notificheEmail: boolean;
  emailVerificata: boolean;
  attivo: boolean;
  ultimoAccesso?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Sala {
  id: string;
  nome: string;
  piano: number;
  descrizione?: string | null;
  isSilenziosa: boolean;
  isGruppi: boolean;
  capienzaMax: number;
  orarioApertura: string;
  orarioChiusura: string;
  attiva: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Posto {
  id: string;
  numero: string;
  salaId: string;
  coordinataX: number;
  coordinataY: number;
  haPresaElettrica: boolean;
  haFinestra: boolean;
  isAccessibile: boolean;
  tavoloRegolabile: boolean;
  stato: StatoPosto;
  attivo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Prenotazione {
  id: string;
  userId: string;
  postoId: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  stato: StatoPrenotazione;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  marginePendolare: boolean;
  minutiMarginePendolare: number;
  estesa: boolean;
  oraFineOriginale?: Date | null;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Libro {
  id: string;
  isbn: string;
  titolo: string;
  autore: string;
  editore?: string | null;
  anno?: number | null;
  categoria?: string | null;
  descrizione?: string | null;
  scaffale?: string | null;
  piano?: number | null;
  copieTotali: number;
  copieDisponibili: number;
  copertina?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Prestito {
  id: string;
  userId: string;
  libroId: string;
  dataPrestito: Date;
  dataScadenza: Date;
  dataRestituzione?: Date | null;
  stato: StatoPrestito;
  rinnovi: number;
  maxRinnovi: number;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notifica {
  id: string;
  userId: string;
  tipo: TipoNotifica;
  titolo: string;
  messaggio: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  letta: boolean;
  lettaAt?: Date | null;
  createdAt: Date;
}

// ============================================
// TIPI CON RELAZIONI
// ============================================

// Utente con relazioni
export interface UserWithRelations {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  matricola?: string | null;
  ruolo: 'STUDENTE' | 'BIBLIOTECARIO' | 'ADMIN';
  isPendolare: boolean;
  necessitaAccessibilita: boolean;
  prenotazioni?: PrenotazioneWithRelations[];
  prestiti?: PrestitoWithRelations[];
}

// Posto con sala
export interface PostoWithSala {
  id: string;
  numero: string;
  sala: {
    id: string;
    nome: string;
    piano: number;
  };
  coordinataX: number;
  coordinataY: number;
  haPresaElettrica: boolean;
  haFinestra: boolean;
  isAccessibile: boolean;
  tavoloRegolabile: boolean;
  stato: 'DISPONIBILE' | 'OCCUPATO' | 'MANUTENZIONE' | 'RISERVATO';
}

// Prenotazione con relazioni
export interface PrenotazioneWithRelations {
  id: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  stato: 'CONFERMATA' | 'CHECK_IN' | 'COMPLETATA' | 'CANCELLATA' | 'NO_SHOW' | 'SCADUTA';
  marginePendolare: boolean;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  user: {
    id: string;
    nome: string;
    cognome: string;
  };
  posto: PostoWithSala;
}

// Prestito con relazioni
export interface PrestitoWithRelations {
  id: string;
  dataPrestito: Date;
  dataScadenza: Date;
  dataRestituzione?: Date | null;
  stato: 'ATTIVO' | 'RESTITUITO' | 'SCADUTO' | 'RINNOVATO';
  rinnovi: number;
  maxRinnovi: number;
  libro: {
    id: string;
    titolo: string;
    autore: string;
    isbn: string;
  };
}

// ============================================
// API TYPES
// ============================================

// Response generica
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Paginazione
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Filtri prenotazioni
export interface FiltriPrenotazione {
  data?: string;
  salaId?: string;
  piano?: number;
  stato?: StatoPrenotazione;
  soloAccessibili?: boolean;
  soloConPresa?: boolean;
}

// Filtri posti
export interface FiltriPosto {
  salaId?: string;
  piano?: number;
  stato?: StatoPosto;
  haPresaElettrica?: boolean;
  haFinestra?: boolean;
  isAccessibile?: boolean;
  data?: string;
  oraInizio?: string;
  oraFine?: string;
}

// ============================================
// FORM TYPES
// ============================================

// Form nuova prenotazione
export interface NuovaPrenotazioneForm {
  postoId: string;
  data: string;
  oraInizio: string;
  oraFine: string;
  marginePendolare: boolean;
  note?: string;
}

// Form login
export interface LoginForm {
  email: string;
  password: string;
}

// Form registrazione
export interface RegistrazioneForm {
  email: string;
  password: string;
  confermaPassword: string;
  nome: string;
  cognome: string;
  matricola: string;
  isPendolare: boolean;
  necessitaAccessibilita: boolean;
}

// ============================================
// MAPPA TYPES
// ============================================

// Stato posto per mappa
export type StatoPostoMappa = 'libero' | 'occupato' | 'prenotato' | 'selezionato' | 'non-disponibile';

// Posto per visualizzazione mappa
export interface PostoMappa {
  id: string;
  numero: string;
  x: number;
  y: number;
  stato: StatoPostoMappa;
  caratteristiche: {
    presa: boolean;
    finestra: boolean;
    accessibile: boolean;
  };
}

// Piano biblioteca
export interface PianoBiblioteca {
  numero: number;
  nome: string;
  sale: SalaMappa[];
}

// Sala per mappa
export interface SalaMappa {
  id: string;
  nome: string;
  tipo: 'silenziosa' | 'gruppi' | 'normale';
  posti: PostoMappa[];
}

// ============================================
// STATISTICHE TYPES
// ============================================

// Stats dashboard
export interface DashboardStats {
  postiDisponibili: number;
  postiOccupati: number;
  prenotazioniOggi: number;
  prenotazioniSettimana: number;
  percentualeOccupazione: number;
  checkInMancati: number;
}

// Stats utente
export interface StatisticheUtente {
  totalePrenotazioni: number;
  prenotazioniMese: number;
  tempoMedioStudio: number; // in minuti
  salaPreferita?: string;
  postoPreferito?: string;
  noShowCount: number;
}
