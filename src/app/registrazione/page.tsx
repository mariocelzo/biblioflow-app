"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Mail,
  CheckCircle,
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
  { id: 1, title: "Dati personali", icon: User },
  { id: 2, title: "Profilo pendolare", icon: Train },
  { id: 3, title: "Accessibilità", icon: Accessibility },
];

export default function RegistrazionePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [verificationLink, setVerificationLink] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(false);

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
        const pwdErrors: string[] = [];
        if (formData.password.length < 8) pwdErrors.push("Almeno 8 caratteri");
        if (!/[A-Z]/.test(formData.password)) pwdErrors.push("Almeno una maiuscola");
        if (!/[a-z]/.test(formData.password)) pwdErrors.push("Almeno una minuscola");
        if (!/[0-9]/.test(formData.password)) pwdErrors.push("Almeno un numero");
        if (pwdErrors.length > 0) errors.password = pwdErrors;
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
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/registrazione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details) setFieldErrors(data.details);
        setError(data.error || "Errore durante la registrazione");
        return;
      }

      if (data?.data?.verification) {
        setVerificationLink(data.data.verification.link);
        setVerificationToken(data.data.verification.token);
        setShowVerification(true);
        return;
      }

      router.push("/login?registered=true");
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!verificationLink) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(verificationLink, { method: "GET" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Errore durante la verifica");
      } else {
        router.push("/login?verified=true");
      }
    } catch {
      setError("Errore di connessione");
    } finally {
      setIsLoading(false);
    }
  };

  const renderFieldError = (field: string) => {
    if (!fieldErrors[field]) return null;
    return (
      <div className="text-sm text-red-600 dark:text-red-400 mt-1">
        {fieldErrors[field].map((err, i) => (
          <p key={i}>• {err}</p>
        ))}
      </div>
    );
  };

  if (showVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
                <Mail className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Verifica la tua email</CardTitle>
            <CardDescription>
              Ti abbiamo inviato un&apos;email di conferma.<br />
              Clicca sul link per attivare il tuo account.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div role="alert" className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {verificationToken && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                  <strong>Demo:</strong> Usa questo link per verificare:
                </p>
                <code className="text-xs break-all block p-2 bg-white dark:bg-gray-800 rounded">
                  {verificationLink}
                </code>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button onClick={handleVerifyEmail} disabled={isLoading || !verificationLink} className="w-full">
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando...</>
                ) : (
                  <><CheckCircle className="mr-2 h-4 w-4" />Verifica Email (Demo)</>
                )}
              </Button>
              <Button variant="outline" onClick={() => router.push("/login")} className="w-full">
                Vai al Login
              </Button>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-2 text-center text-sm text-muted-foreground">
            <p>Non hai ricevuto l&apos;email?</p>
            <p>Controlla la cartella spam o riprova più tardi.</p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Back Button */}
        <div className="flex items-center">
          <BackButton href="/login" label="Torna al login" />
        </div>

        <Card className="border-0 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="rounded-2xl bg-blue-100 p-4">
              <BookOpen className="h-10 w-10 text-blue-600" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">Registrati</CardTitle>
          <CardDescription className="text-base text-slate-600">Crea il tuo account in pochi semplici passaggi</CardDescription>

          <div className="flex items-center justify-center gap-2 pt-4">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              return (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${isCompleted ? "bg-green-500 text-white" : ""} ${isCurrent ? "bg-primary text-primary-foreground" : ""} ${!isCompleted && !isCurrent ? "bg-muted text-muted-foreground" : ""}`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {isCompleted ? <Check className="h-5 w-5" aria-hidden="true" /> : <StepIcon className="h-5 w-5" aria-hidden="true" />}
                  </div>
                  {index < STEPS.length - 1 && <div className={`w-12 h-1 mx-1 rounded ${isCompleted ? "bg-green-500" : "bg-muted"}`} />}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">Passaggio {currentStep} di {STEPS.length}: {STEPS[currentStep - 1].title}</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div role="alert" aria-live="polite" className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input id="nome" placeholder="Mario" value={formData.nome} onChange={(e) => updateFormData("nome", e.target.value)} aria-invalid={!!fieldErrors.nome} />
                  {renderFieldError("nome")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cognome">Cognome *</Label>
                  <Input id="cognome" placeholder="Rossi" value={formData.cognome} onChange={(e) => updateFormData("cognome", e.target.value)} aria-invalid={!!fieldErrors.cognome} />
                  {renderFieldError("cognome")}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email universitaria *</Label>
                <Input id="email" type="email" placeholder="nome.cognome@studenti.unimi.it" value={formData.email} onChange={(e) => updateFormData("email", e.target.value)} aria-invalid={!!fieldErrors.email} />
                {renderFieldError("email")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="matricola">Matricola (opzionale)</Label>
                <Input id="matricola" placeholder="1234567890" value={formData.matricola} onChange={(e) => updateFormData("matricola", e.target.value)} aria-invalid={!!fieldErrors.matricola} maxLength={10} />
                <p className="text-xs text-muted-foreground">10 cifre numeriche</p>
                {renderFieldError("matricola")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Almeno 8 caratteri" value={formData.password} onChange={(e) => updateFormData("password", e.target.value)} aria-invalid={!!fieldErrors.password} />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Nascondi password" : "Mostra password"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Min. 8 caratteri, 1 maiuscola, 1 minuscola, 1 numero</p>
                {renderFieldError("password")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confermaPassword">Conferma password *</Label>
                <Input id="confermaPassword" type={showPassword ? "text" : "password"} placeholder="Ripeti la password" value={formData.confermaPassword} onChange={(e) => updateFormData("confermaPassword", e.target.value)} aria-invalid={!!fieldErrors.confermaPassword} />
                {renderFieldError("confermaPassword")}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="isPendolare" className="text-base font-medium">Sei uno studente pendolare?</Label>
                  <p className="text-sm text-muted-foreground">Ci aiuta a ottimizzare le tue prenotazioni</p>
                </div>
                <Switch id="isPendolare" checked={formData.isPendolare} onCheckedChange={(checked) => updateFormData("isPendolare", checked)} />
              </div>

              {formData.isPendolare && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="cittaResidenza">Città di residenza</Label>
                    <Input id="cittaResidenza" placeholder="Es. Monza, Bergamo..." value={formData.cittaResidenza} onChange={(e) => updateFormData("cittaResidenza", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mezzoTrasporto">Mezzo di trasporto</Label>
                    <Input id="mezzoTrasporto" placeholder="Es. Treno, Auto, Bus..." value={formData.mezzoTrasporto} onChange={(e) => updateFormData("mezzoTrasporto", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tempoPercorrenza">Tempo di percorrenza (minuti)</Label>
                    <Input id="tempoPercorrenza" type="number" placeholder="Es. 45" value={formData.tempoPercorrenza} onChange={(e) => updateFormData("tempoPercorrenza", e.target.value)} />
                  </div>
                </div>
              )}

              {!formData.isPendolare && (
                <div className="text-center text-muted-foreground py-8">
                  <Train className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Se non sei pendolare, passa al prossimo step.<br />Potrai modificare questa informazione in seguito.</p>
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="necessitaAccessibilita" className="text-base font-medium">Hai esigenze di accessibilità?</Label>
                  <p className="text-sm text-muted-foreground">Ci aiuta a suggerirti posti adeguati</p>
                </div>
                <Switch id="necessitaAccessibilita" checked={formData.necessitaAccessibilita} onCheckedChange={(checked) => updateFormData("necessitaAccessibilita", checked)} />
              </div>

              {formData.necessitaAccessibilita && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="tipoAccessibilita">Tipo di esigenza (opzionale)</Label>
                    <Input id="tipoAccessibilita" placeholder="Es. Mobilità ridotta, DSA..." value={formData.tipoAccessibilita} onChange={(e) => updateFormData("tipoAccessibilita", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="altreNote">Note aggiuntive</Label>
                    <Input id="altreNote" placeholder="Altre informazioni utili..." value={formData.altreNote} onChange={(e) => updateFormData("altreNote", e.target.value)} />
                  </div>
                </div>
              )}

              {!formData.necessitaAccessibilita && (
                <div className="text-center text-muted-foreground py-8">
                  <Accessibility className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Se non hai esigenze particolari, completa la registrazione.<br />Potrai modificare queste informazioni in seguito.</p>
                </div>
              )}

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Privacy:</strong> I tuoi dati saranno trattati in conformità al GDPR. Le informazioni su accessibilità sono utilizzate esclusivamente per migliorare la tua esperienza.
                </p>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <div className="flex w-full gap-3">
            {currentStep > 1 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading} className="flex-1">
                <ChevronLeft className="mr-2 h-4 w-4" />Indietro
              </Button>
            )}
            {currentStep < STEPS.length ? (
              <Button type="button" onClick={handleNext} disabled={isLoading} className="flex-1">
                Avanti<ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={isLoading} className="flex-1">
                {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrazione...</>) : (<><Check className="mr-2 h-4 w-4" />Completa registrazione</>)}
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
