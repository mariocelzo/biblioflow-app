"use client";

// ============================================================================
// WIZARD DI REGISTRAZIONE - BiblioFlow
// ============================================================================
// Tre passaggi: dati personali → profilo pendolare → accessibilità.
//
// SCELTE DI FONDO (il "perché" delle modifiche piu' recenti):
//  - Lo step 2 non ha piu' campi di testo libero. Comune, mezzo e tempo di
//    percorrenza si scelgono da elenchi chiusi: il dato nasce gia' pulito e
//    all'utente basta riconoscere invece che ricordare/inventare un formato.
//  - Lo step 3 propone le esigenze di accessibilita' come caselle da spuntare,
//    per non costringere nessuno a descrivere a parole la propria condizione.
//  - I requisiti della password si accendono mentre si digita, invece di
//    comparire come errore dopo aver premuto "Avanti".
//  - Il cambio di passaggio e' animato e sposta il focus sul titolo del nuovo
//    step: serve tanto a orientare chi guarda quanto ad annunciare il cambio a
//    chi usa uno screen reader.
//
// Il contratto verso l'API NON cambia: `cittaResidenza`, `mezzoTrasporto` e
// `tempoPercorrenza` restano tre stringhe facoltative, e i valori sono scelti
// perche' compongano una frase corretta con il template della route
// (`Da: … | Mezzo: … | Tempo: … min`).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { Switch } from "@/components/ui/switch";
import { Combobox, type OpzioneCombobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cercaComuni, etichettaComune } from "@/lib/comuni-campania";
import {
  anteprimaTragittoPendolare,
  FASCE_TEMPO_PERCORRENZA,
  MEZZI_TRASPORTO,
} from "@/lib/profilo-pendolare";
import {
  componiTipoAccessibilita,
  ESIGENZE_ACCESSIBILITA,
} from "@/lib/esigenze-accessibilita";
import {
  REQUISITI_PASSWORD,
  requisitiMancanti,
  requisitiSoddisfatti,
} from "@/lib/requisiti-password";
import {
  Loader2,
  BookOpen,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Check,
  Train,
  Accessibility,
  User,
  ShieldCheck,
  MapPin,
  Clock,
  Sparkles,
} from "lucide-react";

interface FormData {
  email: string;
  password: string;
  confermaPassword: string;
  nome: string;
  cognome: string;
  matricola: string;
  isPendolare: boolean;
  cittaResidenza: string;
  mezzoTrasporto: string;
  tempoPercorrenza: string;
  necessitaAccessibilita: boolean;
  tipoAccessibilita: string;
  altreNote: string;
}

const initialFormData: FormData = {
  email: "",
  password: "",
  confermaPassword: "",
  nome: "",
  cognome: "",
  matricola: "",
  isPendolare: false,
  cittaResidenza: "",
  mezzoTrasporto: "",
  tempoPercorrenza: "",
  necessitaAccessibilita: false,
  tipoAccessibilita: "",
  altreNote: "",
};

const STEPS = [
  {
    id: 1,
    title: "Dati personali",
    icon: User,
    sottotitolo: "Le credenziali per accedere a BiblioFlow",
  },
  {
    id: 2,
    title: "Profilo pendolare",
    icon: Train,
    sottotitolo: "Facoltativo: ci serve per adattare i tempi di check-in",
  },
  {
    id: 3,
    title: "Accessibilità",
    icon: Accessibility,
    sottotitolo: "Facoltativo: ci serve per suggerirti i posti adatti",
  },
];

/**
 * Decide dove mandare l'utente dopo una registrazione riuscita.
 *
 * In sviluppo l'API restituisce il link di verifica gia' pronto (in produzione
 * no, finding C-1: sarebbe auto-verificabile). Se c'e', lo seguiamo: cosi' il
 * flusso resta percorribile in locale anche senza un backend di posta
 * configurato. Altrimenti si va alla pagina che spiega di controllare la posta.
 *
 * Il link viene comunque RICOSTRUITO da zero prendendo solo `search`: cosi' un
 * valore inatteso non puo' diventare un redirect verso l'esterno.
 */
function percorsoDopoRegistrazione(
  data: { data?: { verification?: { link?: string } } },
  email: string,
): string {
  const link = data?.data?.verification?.link;

  if (typeof link === "string") {
    try {
      const analizzato = new URL(link, window.location.origin);
      if (analizzato.pathname === "/verifica-email") {
        return `/verifica-email${analizzato.search}`;
      }
    } catch {
      // Link malformato: si ripiega sul percorso generico qui sotto.
    }
  }

  return `/verifica-email?email=${encodeURIComponent(email)}`;
}

/**
 * Adatta i comuni al formato che il Combobox si aspetta.
 *
 * Il `valore` salvato e' l'etichetta completa "Agropoli (SA)": la provincia
 * resta cosi' dentro `tragittoPendolare` e chi legge il profilo capisce la
 * distanza senza conoscere a memoria 341 comuni.
 */
function cercaOpzioniComuni(query: string): OpzioneCombobox[] {
  return cercaComuni(query).map((comune) => ({
    valore: etichettaComune(comune),
    etichetta: comune.nome,
    dettaglio: comune.provincia,
  }));
}

export default function RegistrazionePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  // Direzione dell'ultima transizione: serve solo all'animazione, che deve
  // entrare da destra andando avanti e da sinistra tornando indietro. Senza,
  // il movimento sarebbe sempre lo stesso e non comunicherebbe nulla.
  const [direzione, setDirezione] = useState<"avanti" | "indietro">("avanti");
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Step 3: le esigenze spuntate stanno in uno stato a parte perche' l'API
  // vuole UNA stringa. Vengono unite solo al momento dell'invio, cosi' l'utente
  // puo' spuntare e togliere liberamente senza che il form ricomponga testo a
  // ogni clic.
  const [esigenze, setEsigenze] = useState<string[]>([]);
  const [altraEsigenza, setAltraEsigenza] = useState("");

  // Riferimento al banner d'errore, per poterlo portare a schermo (vedi
  // `mostraErrore`): il pulsante di invio e' in fondo alla card, il banner in
  // cima, e su mobile i due non stanno nella stessa schermata.
  const erroreRef = useRef<HTMLDivElement>(null);
  // Titolo del passaggio corrente: ci spostiamo il focus a ogni cambio di step.
  const titoloStepRef = useRef<HTMLHeadingElement>(null);
  // Al primo render il focus NON va spostato, altrimenti la pagina "ruberebbe"
  // il focus appena caricata, saltando la barra di navigazione del browser.
  const primoRender = useRef(true);

  useEffect(() => {
    if (primoRender.current) {
      primoRender.current = false;
      return;
    }
    // Spostare il focus sul titolo fa annunciare allo screen reader in quale
    // passaggio ci si trova: senza, cambierebbe mezzo modulo in silenzio.
    titoloStepRef.current?.focus();
  }, [currentStep]);

  const updateFormData = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  /** Aggiunge o toglie un'esigenza di accessibilita' dalle caselle spuntate. */
  const alternaEsigenza = (valore: string) => {
    setEsigenze((prec) =>
      prec.includes(valore)
        ? prec.filter((v) => v !== valore)
        : [...prec, valore],
    );
  };

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string[]> = {};

    if (step === 1) {
      if (!formData.nome.trim()) errors.nome = ["Il nome è obbligatorio"];
      if (!formData.cognome.trim()) errors.cognome = ["Il cognome è obbligatorio"];
      if (!formData.email.trim()) {
        errors.email = ["L'email è obbligatoria"];
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = ["Inserisci un'email valida"];
      }
      if (!formData.password) {
        errors.password = ["La password è obbligatoria"];
      } else {
        // Le regole vivono in `lib/requisiti-password`, le stesse che
        // alimentano le spunte dal vivo qui sotto: un solo punto di verita',
        // cosi' il riscontro visivo e il blocco del pulsante non possono
        // dissentire tra loro.
        const mancanti = requisitiMancanti(formData.password);
        if (mancanti.length > 0) errors.password = mancanti;
      }
      if (formData.password !== formData.confermaPassword) {
        errors.confermaPassword = ["Le password non corrispondono"];
      }
      if (formData.matricola && !/^\d{10}$/.test(formData.matricola)) {
        errors.matricola = ["La matricola deve contenere esattamente 10 cifre"];
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setDirezione("avanti");
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setDirezione("indietro");
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setError(null);
  };

  /**
   * Mostra un errore assicurandosi che l'utente lo VEDA.
   *
   * PERCHE': il banner sta in cima alla card, mentre il pulsante "Completa
   * registrazione" e' in fondo. Su schermi piccoli l'errore compariva fuori
   * dall'area visibile: l'utente premeva il pulsante, non vedeva cambiare
   * nulla e concludeva che il sito fosse bloccato.
   */
  const mostraErrore = (messaggio: string) => {
    setError(messaggio);
    // Lo scroll va rimandato dopo il render, altrimenti il nodo non esiste.
    requestAnimationFrame(() => {
      erroreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      erroreRef.current?.focus();
    });
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsLoading(true);
    setError(null);

    try {
      // `tipoAccessibilita` viene composto SOLO ora, unendo le caselle spuntate
      // all'eventuale testo libero: l'API continua a ricevere una stringa,
      // esattamente come prima.
      const payload = {
        ...formData,
        tipoAccessibilita: formData.necessitaAccessibilita
          ? componiTipoAccessibilita(esigenze, altraEsigenza)
          : "",
      };

      const response = await fetch("/api/auth/registrazione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details) setFieldErrors(data.details);
        mostraErrore(data.error || "Errore durante la registrazione");
        return;
      }

      // Un 2xx con `success` falsy non e' un successo: senza questo ramo non
      // accadeva NULLA (nessun errore, nessuna navigazione) e l'utente restava
      // fermo sullo step 3 senza capire perche'.
      if (!data?.success) {
        mostraErrore("Registrazione non completata. Riprova.");
        return;
      }

      // NIENTE LOGIN AUTOMATICO.
      //
      // PERCHE' E' STATO TOLTO: l'account nasce con `emailVerificata: false` e
      // il login rifiuta esattamente quel caso (finding A-5). L'auto-login non
      // poteva quindi mai riuscire. Peggio: il codice controllava
      // `loginResult.ok`, che in next-auth v5 e' solo `res.ok` della POST HTTP
      // — 200 anche quando l'autenticazione viene NEGATA. Il ramo "successo"
      // veniva percio' imboccato sempre e l'utente finiva in home slegato,
      // senza un solo messaggio: e' questo il bug per cui "l'ultimo step non
      // andava avanti".
      //
      // Il passo giusto dopo la registrazione e' la verifica dell'indirizzo.
      router.push(percorsoDopoRegistrazione(data, formData.email));
    } catch {
      mostraErrore("Errore di connessione. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Errore di campo, collegato all'input tramite `aria-describedby`.
   *
   * `role="alert"` e NON `aria-live`: in `globals.css` esiste una regola che
   * sposta fuori schermo qualsiasi elemento con l'attributo `aria-live`, e un
   * messaggio d'errore invisibile e' peggio di nessun messaggio. `role="alert"`
   * ha comunque la stessa semantica per gli screen reader.
   */
  const renderFieldError = (field: string) => {
    if (!fieldErrors[field]) return null;
    return (
      <div
        id={`${field}-error`}
        role="alert"
        className="animate-in fade-in-0 slide-in-from-top-1 mt-1 text-sm text-red-600 dark:text-red-400"
      >
        {fieldErrors[field].map((err, i) => (
          <p key={i}>• {err}</p>
        ))}
      </div>
    );
  };

  /** Costruisce `aria-describedby` unendo il testo di aiuto e l'errore. */
  const descrittori = (field: string, idAiuto?: string) =>
    [idAiuto, fieldErrors[field] ? `${field}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  // --- riscontro dal vivo sulla password -----------------------------------
  const forzaPassword = requisitiSoddisfatti(formData.password);
  const percentualeForza = (forzaPassword / REQUISITI_PASSWORD.length) * 100;

  // --- anteprima di cio' che verra' salvato come tragitto -------------------
  // Trasparenza: l'utente vede la frase esatta che finira' sul suo profilo,
  // invece di dover indovinare come vengano combinati i tre campi.
  const anteprimaTragitto = useMemo(
    () =>
      formData.isPendolare
        ? anteprimaTragittoPendolare({
            cittaResidenza: formData.cittaResidenza,
            mezzoTrasporto: formData.mezzoTrasporto,
            tempoPercorrenza: formData.tempoPercorrenza,
          })
        : null,
    [
      formData.isPendolare,
      formData.cittaResidenza,
      formData.mezzoTrasporto,
      formData.tempoPercorrenza,
    ],
  );

  const mezzoSelezionato = MEZZI_TRASPORTO.find(
    (m) => m.valore === formData.mezzoTrasporto,
  );

  const stepCorrente = STEPS[currentStep - 1];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900 p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Back Button */}
        <div className="flex items-center">
          <BackButton href="/login" label="Torna al login" />
        </div>

        <Card className="border-0 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-2xl bg-blue-100 dark:bg-blue-900 p-4">
              <BookOpen className="h-10 w-10 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">Registrati</CardTitle>
          <CardDescription className="text-base text-muted-foreground">Crea il tuo account in pochi semplici passaggi</CardDescription>

          {/*
            Indicatore di avanzamento.

            E' una <ol>, non una fila di <div>: cosi' e' una vera sequenza
            ordinata anche per chi la ascolta. Ogni pallino porta un testo
            `sr-only` con lo stato ("completato", "in corso", "da completare"),
            perche' il colore da solo non e' un'informazione accessibile
            (WCAG 1.4.1). I connettori si riempiono con una transizione di
            larghezza: e' il movimento a rendere leggibile il progresso.
          */}
          <ol className="flex items-start justify-center gap-1 pt-2" aria-label="Avanzamento della registrazione">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              return (
                <li key={step.id} className="flex items-start">
                  <div className="flex w-20 flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                        isCompleted && "bg-green-500 text-white",
                        isCurrent &&
                          "bg-primary text-primary-foreground ring-primary/25 scale-110 ring-4",
                        !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                      )}
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5 animate-in zoom-in-50 duration-300" aria-hidden="true" />
                      ) : (
                        <StepIcon className="h-5 w-5" aria-hidden="true" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-center text-[11px] leading-tight transition-colors",
                        isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
                      )}
                    >
                      {step.title}
                    </span>
                    <span className="sr-only">
                      {isCompleted ? "completato" : isCurrent ? "in corso" : "da completare"}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="bg-muted mt-[18px] h-1 w-8 overflow-hidden rounded-full" aria-hidden="true">
                      <div
                        className={cn(
                          "h-full rounded-full bg-green-500 transition-all duration-500 ease-out",
                          isCompleted ? "w-full" : "w-0",
                        )}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div ref={erroreRef} tabIndex={-1} role="alert" aria-live="polite" className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/*
            `key={currentStep}` rimonta il blocco a ogni cambio di passaggio:
            e' quello che fa ripartire l'animazione di entrata. La direzione
            dello scorrimento segue quella della navigazione, cosi' il movimento
            racconta se si sta avanzando o tornando indietro.
          */}
          <div
            key={currentStep}
            className={cn(
              "animate-in fade-in-0 duration-300 motion-reduce:animate-none",
              direzione === "avanti"
                ? "slide-in-from-right-6"
                : "slide-in-from-left-6",
            )}
          >
            {/* Titolo del passaggio: riceve il focus a ogni cambio di step. */}
            <div className="mb-5 border-b pb-3">
              <h2
                ref={titoloStepRef}
                tabIndex={-1}
                className="text-base font-semibold outline-none"
              >
                <span className="text-muted-foreground font-normal">
                  Passaggio {currentStep} di {STEPS.length} ·{" "}
                </span>
                {stepCorrente.title}
              </h2>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {stepCorrente.sottotitolo}
              </p>
            </div>

          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Su schermi stretti nome e cognome andavano stretti in due
                  colonne: sotto `sm` restano incolonnati. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input id="nome" autoComplete="given-name" placeholder="Mario" value={formData.nome} onChange={(e) => updateFormData("nome", e.target.value)} aria-invalid={!!fieldErrors.nome} aria-describedby={descrittori("nome")} />
                  {renderFieldError("nome")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cognome">Cognome *</Label>
                  <Input id="cognome" autoComplete="family-name" placeholder="Rossi" value={formData.cognome} onChange={(e) => updateFormData("cognome", e.target.value)} aria-invalid={!!fieldErrors.cognome} aria-describedby={descrittori("cognome")} />
                  {renderFieldError("cognome")}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email universitaria *</Label>
                {/* Il placeholder citava un dominio di un altro ateneo
                    (unimi.it): qui l'utenza e' UNISA, e un esempio sbagliato
                    e' un invito a sbagliare. */}
                <Input id="email" type="email" autoComplete="email" placeholder="nome.cognome@studenti.unisa.it" value={formData.email} onChange={(e) => updateFormData("email", e.target.value)} aria-invalid={!!fieldErrors.email} aria-describedby={descrittori("email")} />
                {renderFieldError("email")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="matricola">Matricola (opzionale)</Label>
                {/* `inputMode="numeric"` apre il tastierino sui telefoni: la
                    matricola e' solo cifre e la tastiera alfabetica e' un
                    ostacolo inutile. */}
                <Input id="matricola" inputMode="numeric" placeholder="1234567890" value={formData.matricola} onChange={(e) => updateFormData("matricola", e.target.value)} aria-invalid={!!fieldErrors.matricola} aria-describedby={descrittori("matricola", "matricola-aiuto")} maxLength={10} />
                <p id="matricola-aiuto" className="text-xs text-muted-foreground">
                  10 cifre numeriche{formData.matricola && ` · ${formData.matricola.length}/10`}
                </p>
                {renderFieldError("matricola")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Almeno 8 caratteri" value={formData.password} onChange={(e) => updateFormData("password", e.target.value)} aria-invalid={!!fieldErrors.password} aria-describedby={descrittori("password", "password-requisiti")} className="pr-10" />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Nascondi password" : "Mostra password"}>
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>

                {/*
                  Requisiti con riscontro dal vivo.

                  PERCHE': prima comparivano tutti insieme come errore DOPO il
                  clic su "Avanti". Cosi' invece la spunta si accende mentre si
                  digita e la barra dice a colpo d'occhio quanto manca; l'errore
                  diventa un caso raro invece della norma.

                  Il colore non e' l'unico veicolo dell'informazione: c'e'
                  sempre l'icona (pallino → spunta) e il testo, come richiesto
                  da WCAG 1.4.1.
                */}
                <div id="password-requisiti" className="space-y-2 pt-1">
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        forzaPassword <= 1 && "bg-red-500",
                        forzaPassword === 2 && "bg-orange-500",
                        forzaPassword === 3 && "bg-yellow-500",
                        forzaPassword === 4 && "bg-green-500",
                      )}
                      style={{ width: `${percentualeForza}%` }}
                    />
                  </div>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {REQUISITI_PASSWORD.map((requisito) => {
                      const ok = requisito.soddisfatto(formData.password);
                      return (
                        <li
                          key={requisito.id}
                          className={cn(
                            "flex items-center gap-1.5 text-xs transition-colors",
                            ok
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {ok ? (
                            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <span className="bg-muted-foreground/40 h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                          )}
                          <span>{requisito.etichetta}</span>
                          <span className="sr-only">
                            {ok ? "requisito soddisfatto" : "requisito non ancora soddisfatto"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {renderFieldError("password")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confermaPassword">Conferma password *</Label>
                <div className="relative">
                  <Input id="confermaPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Ripeti la password" value={formData.confermaPassword} onChange={(e) => updateFormData("confermaPassword", e.target.value)} aria-invalid={!!fieldErrors.confermaPassword} aria-describedby={descrittori("confermaPassword")} className="pr-10" />
                  {/* Conferma silenziosa che le due password coincidono: evita
                      di dover premere "Avanti" per scoprirlo. */}
                  {formData.confermaPassword.length > 0 &&
                    formData.confermaPassword === formData.password && (
                      <Check
                        className="animate-in zoom-in-50 absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-green-600 dark:text-green-400"
                        aria-hidden="true"
                      />
                    )}
                </div>
                {renderFieldError("confermaPassword")}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              <div
                className={cn(
                  "flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors",
                  formData.isPendolare && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="space-y-1">
                  <Label htmlFor="isPendolare" className="text-base font-medium">Sei uno studente pendolare?</Label>
                  <p className="text-sm text-muted-foreground">Ci aiuta a ottimizzare le tue prenotazioni</p>
                </div>
                <Switch id="isPendolare" checked={formData.isPendolare} onCheckedChange={(checked) => updateFormData("isPendolare", checked)} />
              </div>

              {formData.isPendolare && (
                <div className="animate-in fade-in-0 slide-in-from-top-2 space-y-4 rounded-lg border bg-muted/30 p-4 duration-300 motion-reduce:animate-none">
                  <div className="space-y-2">
                    <Label htmlFor="cittaResidenza" className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      Comune di residenza
                    </Label>
                    {/*
                      Elenco chiuso con ricerca al posto del testo libero.

                      PERCHE': BiblioFlow serve UNISA, quindi il bacino reale
                      sono i comuni campani. Scrivere a mano produceva grafie
                      diverse per lo stesso comune, inutilizzabili per capire da
                      dove arrivano gli studenti. La ricerca ignora accenti e
                      apostrofi: digitando "sant" si trova "Sant'Angelo".
                    */}
                    <Combobox
                      id="cittaResidenza"
                      value={formData.cittaResidenza}
                      onChange={(valore) => updateFormData("cittaResidenza", valore)}
                      /* Definita a livello di modulo: l'identita' e' stabile e
                         il `useMemo` interno al Combobox continua a valere. */
                      cerca={cercaOpzioniComuni}
                      placeholder="Cerca il tuo comune…"
                      placeholderRicerca="Scrivi le prime lettere…"
                      messaggioVuoto="Nessun comune trovato in Campania"
                      etichettaRicerca="Cerca un comune della Campania"
                      aria-describedby="citta-aiuto"
                    />
                    <p id="citta-aiuto" className="text-xs text-muted-foreground">
                      Comuni della Campania. Se risiedi fuori regione, lascia il campo vuoto.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mezzoTrasporto" className="flex items-center gap-1.5">
                      <Train className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      Mezzo di trasporto
                    </Label>
                    <Select
                      value={formData.mezzoTrasporto}
                      onValueChange={(valore) => updateFormData("mezzoTrasporto", valore)}
                    >
                      <SelectTrigger id="mezzoTrasporto" className="w-full" aria-describedby="mezzo-aiuto">
                        <SelectValue placeholder="Come raggiungi il campus?" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEZZI_TRASPORTO.map((mezzo) => {
                          const IconaMezzo = mezzo.icona;
                          return (
                            <SelectItem key={mezzo.valore} value={mezzo.valore}>
                              <IconaMezzo className="h-4 w-4" aria-hidden="true" />
                              {mezzo.etichetta}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {/* La descrizione del mezzo scelto sta QUI e non dentro
                        l'opzione: Radix ripete i figli dell'item nel pulsante,
                        e la riga di aiuto lo renderebbe illeggibile. */}
                    <p id="mezzo-aiuto" className="text-xs text-muted-foreground">
                      {mezzoSelezionato?.descrizione ?? "Serve a stimare i tuoi tempi di arrivo."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tempoPercorrenza" className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      Tempo di percorrenza
                    </Label>
                    {/*
                      Fasce al posto dell'input numerico.

                      PERCHE': nessuno conosce il proprio tragitto al minuto, e
                      il campo numerico accettava anche valori assurdi. Una
                      stima e' l'unica cosa che l'utente sa davvero, ed e'
                      sufficiente per decidere se allargargli il check-in.
                      I valori restano compatibili col template dell'API, che
                      aggiunge " min" in coda: "Tempo: 15-30 min".
                    */}
                    <Select
                      value={formData.tempoPercorrenza}
                      onValueChange={(valore) => updateFormData("tempoPercorrenza", valore)}
                    >
                      <SelectTrigger id="tempoPercorrenza" className="w-full" aria-describedby="tempo-aiuto">
                        <SelectValue placeholder="Quanto impieghi, di solito?" />
                      </SelectTrigger>
                      <SelectContent>
                        {FASCE_TEMPO_PERCORRENZA.map((fascia) => (
                          <SelectItem key={fascia.valore} value={fascia.valore}>
                            {fascia.etichetta}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p id="tempo-aiuto" className="text-xs text-muted-foreground">
                      Sola andata, porta a porta.
                    </p>
                  </div>

                  {/* Trasparenza: mostriamo la frase esatta che finira' sul
                      profilo, invece di lasciar indovinare come vengano
                      combinati i tre campi. */}
                  {anteprimaTragitto && (
                    <div className="animate-in fade-in-0 rounded-md border border-dashed p-3">
                      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                        Verrà salvato così
                      </p>
                      <p className="mt-1 text-sm">{anteprimaTragitto}</p>
                    </div>
                  )}
                </div>
              )}

              {!formData.isPendolare && (
                <div className="text-center text-muted-foreground py-8">
                  <Train className="h-12 w-12 mx-auto mb-4 opacity-30" aria-hidden="true" />
                  <p>Se non sei pendolare, passa al prossimo step.<br />Potrai modificare questa informazione in seguito.</p>
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-5">
              <div
                className={cn(
                  "flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors",
                  formData.necessitaAccessibilita && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="space-y-1">
                  <Label htmlFor="necessitaAccessibilita" className="text-base font-medium">Hai esigenze di accessibilità?</Label>
                  <p className="text-sm text-muted-foreground">Ci aiuta a suggerirti posti adeguati</p>
                </div>
                <Switch id="necessitaAccessibilita" checked={formData.necessitaAccessibilita} onCheckedChange={(checked) => updateFormData("necessitaAccessibilita", checked)} />
              </div>

              {formData.necessitaAccessibilita && (
                <div className="animate-in fade-in-0 slide-in-from-top-2 space-y-4 duration-300 motion-reduce:animate-none">
                  {/*
                    Caselle al posto del campo libero "Tipo di esigenza".

                    PERCHE': chiedere a qualcuno di scrivere di proprio pugno la
                    propria condizione e' faticoso e non dice al sistema cosa
                    fare. Ogni casella dichiara invece cosa BiblioFlow offrira'
                    in concreto, cosi' la scelta e' informata.

                    Sono <input type="checkbox"> veri, resi invisibili e vestiti
                    dal <label> che li contiene: si mantiene tutto il
                    comportamento nativo (Tab, Spazio, stato per gli screen
                    reader) senza dover reimplementare nulla.
                  */}
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">
                      Di cosa hai bisogno? <span className="text-muted-foreground font-normal">(puoi scegliere più voci)</span>
                    </legend>
                    <div className="grid gap-2">
                      {ESIGENZE_ACCESSIBILITA.map((esigenza) => {
                        const IconaEsigenza = esigenza.icona;
                        const scelta = esigenze.includes(esigenza.valore);
                        return (
                          <label
                            key={esigenza.valore}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                              "hover:bg-accent/50",
                              "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px]",
                              scelta && "border-primary/50 bg-primary/5",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={scelta}
                              onChange={() => alternaEsigenza(esigenza.valore)}
                            />
                            <span
                              className={cn(
                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                                scelta
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-input",
                              )}
                              aria-hidden="true"
                            >
                              {scelta && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <IconaEsigenza className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">{esigenza.valore}</span>
                              <span className="text-muted-foreground block text-xs">{esigenza.descrizione}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <Label htmlFor="altraEsigenza">Altra esigenza (opzionale)</Label>
                    <Input
                      id="altraEsigenza"
                      placeholder="Descrivila con parole tue"
                      value={altraEsigenza}
                      onChange={(e) => setAltraEsigenza(e.target.value)}
                      aria-describedby="altra-esigenza-aiuto"
                    />
                    <p id="altra-esigenza-aiuto" className="text-xs text-muted-foreground">
                      Usalo solo se nessuna delle voci qui sopra ti rappresenta.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="altreNote">Note per il personale (opzionale)</Label>
                    {/* Textarea e non Input: qui ci si aspetta una frase, e un
                        campo a riga singola nascondeva quanto gia' scritto. */}
                    <Textarea
                      id="altreNote"
                      rows={3}
                      maxLength={300}
                      placeholder="Es. preferisco un posto vicino all'ingresso"
                      value={formData.altreNote}
                      onChange={(e) => updateFormData("altreNote", e.target.value)}
                      aria-describedby="note-aiuto"
                    />
                    <p id="note-aiuto" className="text-muted-foreground text-right text-xs">
                      {formData.altreNote.length}/300
                    </p>
                  </div>
                </div>
              )}

              {!formData.necessitaAccessibilita && (
                <div className="text-center text-muted-foreground py-8">
                  <Accessibility className="h-12 w-12 mx-auto mb-4 opacity-30" aria-hidden="true" />
                  <p>Se non hai esigenze particolari, completa la registrazione.<br />Potrai modificare queste informazioni in seguito.</p>
                </div>
              )}

              {/* Riepilogo prima dell'invio: e' l'ultimo passaggio, ed e' il
                  momento in cui l'utente vuole sapere cosa sta per creare. */}
              <div className="bg-muted/40 rounded-lg border p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
                  Riepilogo
                </p>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Account</dt>
                    <dd className="min-w-0 truncate">{formData.email || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Tragitto</dt>
                    <dd className="min-w-0">{anteprimaTragitto ?? "Non sono pendolare"}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Privacy:</strong> i tuoi dati sono trattati in conformità al GDPR. Le informazioni sull&apos;accessibilità servono solo a suggerirti posti adatti e puoi modificarle o rimuoverle in qualsiasi momento dal profilo.
                </p>
              </div>
            </div>
          )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <div className="flex w-full gap-3">
            {currentStep > 1 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading} className="flex-1">
                <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />Indietro
              </Button>
            )}
            {currentStep < STEPS.length ? (
              <Button type="button" onClick={handleNext} disabled={isLoading} className="group flex-1">
                Avanti
                <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={isLoading} className="flex-1">
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Registrazione...</>) : (<><Check className="mr-2 h-4 w-4" aria-hidden="true" />Completa registrazione</>)}
              </Button>
            )}
          </div>
          <p className="text-sm text-center text-muted-foreground">
            Hai già un account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">Accedi</Link>
          </p>
        </CardFooter>
      </Card>
      </div>
    </div>
  );
}
