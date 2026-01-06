# Integrazione SPID, CIE e PosteID - Guida Produzione

Questo documento descrive come integrare i provider di identità digitale italiani (SPID, CIE, PosteID) in BiblioFlow per un deployment in produzione con istituzioni pubbliche.

## 📋 Provider Supportati

### 1. **SPID** (Sistema Pubblico di Identità Digitale)

- **Protocollo**: SAML 2.0
- **Provider**: InfoCert, Poste Italiane, Aruba, Sielte, Namirial, TIM, etc.
- **Use Case**: Login universitario, PA, servizi pubblici

### 2. **CIE** (Carta d'Identità Elettronica)

- **Protocollo**: OpenID Connect / SAML 2.0
- **Provider**: Ministero dell'Interno
- **Use Case**: Cittadini italiani con CIE 3.0+

### 3. **PosteID** (Identità Digitale PosteItaliane)

- **Protocollo**: OpenID Connect
- **Provider**: Poste Italiane
- **Use Case**: Login servizi PA

---

## 🚀 Prerequisiti

### Adesione AgID (per SPID)

1. L'università/ente deve essere **Service Provider** registrato presso AgID
2. Richiedere l'**adesione SPID** tramite portale AgID:
   - https://www.agid.gov.it/it/piattaforme/spid
3. Compilare documentazione tecnica e legale
4. Ottenere **certificati digitali qualificati**
5. **Tempi**: 2-4 mesi per approvazione

### Convenzione CIE

1. Stipulare convenzione con **Ministero dell'Interno**
2. Registrarsi sul portale CIE ID:
   - https://www.cartaidentita.interno.gov.it/
3. **Tempi**: 1-3 mesi

### Integrazione PosteID

1. Contattare Poste Italiane:
   - https://posteid.poste.it
2. Stipulare contratto commerciale
3. **Tempi**: 1-2 mesi

---

## 🛠️ Implementazione Tecnica

### Architettura Consigliata

```
┌─────────────────┐
│  BiblioFlow App │
│   (Next.js)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  NextAuth.js    │
│  + SAML/OIDC    │
└────────┬────────┘
         │
    ┌────┴────┬───────────────┬──────────────┐
    ▼         ▼               ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌─────────────┐
│ Google │ │  SPID  │ │   CIE    │ │  PosteID    │
│ OAuth  │ │ (SAML) │ │ (OIDC)   │ │  (OIDC)     │
└────────┘ └────────┘ └──────────┘ └─────────────┘
```

### 1. Installazione Librerie

```bash
# SAML 2.0 per SPID
npm install @node-saml/node-saml
npm install passport-saml

# Helper SPID
npm install spid-express
```

### 2. Configurazione SPID (esempio)

```typescript
// lib/auth-spid.ts
import { Strategy as SamlStrategy } from "@node-saml/passport-saml";

export const spidConfig = {
  // URL del Service Provider (BiblioFlow)
  callbackUrl: process.env.NEXTAUTH_URL + "/api/auth/callback/spid",
  entryPoint: "https://identity-provider.example.com/sso",

  // Certificati (forniti da AgID dopo approvazione)
  cert: process.env.SPID_CERT,
  privateKey: process.env.SPID_PRIVATE_KEY,

  // Metadati
  issuer: "https://biblioflow.unisa.it",

  // Livelli SPID (1, 2, 3)
  authnContext: ["https://www.spid.gov.it/SpidL2"],

  // Attributi richiesti
  attributeConsumingServiceIndex: "0",
  identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
};
```

### 3. Integrazione in NextAuth

```typescript
// lib/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SamlProvider } from "next-auth/providers/saml";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({...}),

    // SPID Provider
    SamlProvider({
      id: "spid",
      name: "SPID",
      ...spidConfig,
      profile(profile) {
        return {
          id: profile.fiscalNumber,
          email: profile.email,
          name: profile.name,
          surname: profile.familyName,
          fiscalCode: profile.fiscalNumber,
        };
      },
    }),

    // CIE Provider (OpenID Connect)
    {
      id: "cie",
      name: "CIE",
      type: "oidc",
      issuer: "https://idserver.servizicie.interno.gov.it/idp",
      clientId: process.env.CIE_CLIENT_ID,
      clientSecret: process.env.CIE_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.given_name,
          surname: profile.family_name,
          fiscalCode: profile.fiscal_number,
        };
      },
    },

    // PosteID (OpenID Connect)
    {
      id: "posteid",
      name: "PosteID",
      type: "oidc",
      issuer: "https://posteid.poste.it",
      clientId: process.env.POSTEID_CLIENT_ID,
      clientSecret: process.env.POSTEID_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.given_name,
          surname: profile.family_name,
        };
      },
    },
  ],
});
```

### 4. UI Login Page

```tsx
// app/login/page.tsx
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div>
      {/* Login Email/Password */}
      <form onSubmit={handleCredentialsLogin}>...</form>

      {/* Divider */}
      <div className="divider">Oppure accedi con</div>

      {/* OAuth Providers */}
      <Button onClick={() => signIn("google")}>
        <GoogleIcon /> Accedi con Google
      </Button>

      <Button onClick={() => signIn("spid")}>
        <SpidIcon /> Accedi con SPID
      </Button>

      <Button onClick={() => signIn("cie")}>
        <CIEIcon /> Accedi con CIE
      </Button>

      <Button onClick={() => signIn("posteid")}>
        <PosteIcon /> Accedi con PosteID
      </Button>
    </div>
  );
}
```

---

## 🔐 Sicurezza

### Certificati e Chiavi

```bash
# Genera certificato per SPID (esempio)
openssl req -x509 -newkey rsa:4096 \
  -keyout spid-key.pem \
  -out spid-cert.pem \
  -days 3650 \
  -nodes \
  -subj "/C=IT/ST=Campania/L=Fisciano/O=Università di Salerno/CN=biblioflow.unisa.it"
```

### Variabili Ambiente

```bash
# .env.production
SPID_CERT="-----BEGIN CERTIFICATE-----\n..."
SPID_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
SPID_ENTITY_ID="https://biblioflow.unisa.it"

CIE_CLIENT_ID="your-cie-client-id"
CIE_CLIENT_SECRET="your-cie-client-secret"

POSTEID_CLIENT_ID="your-posteid-client-id"
POSTEID_CLIENT_SECRET="your-posteid-client-secret"
```

---

## 📝 Metadati SPID

Il Service Provider deve esporre i metadati SAML pubblici:

```xml
<!-- public/metadata.xml -->
<?xml version="1.0"?>
<EntityDescriptor
    xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
    entityID="https://biblioflow.unisa.it">
  <SPSSODescriptor
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"
      AuthnRequestsSigned="true"
      WantAssertionsSigned="true">

    <KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </KeyDescriptor>

    <AssertionConsumerService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="https://biblioflow.unisa.it/api/auth/callback/spid"
        index="0"
        isDefault="true"/>

    <AttributeConsumingService index="0">
      <ServiceName xml:lang="it">BiblioFlow</ServiceName>
      <RequestedAttribute Name="fiscalNumber" isRequired="true"/>
      <RequestedAttribute Name="email" isRequired="true"/>
      <RequestedAttribute Name="name" isRequired="true"/>
      <RequestedAttribute Name="familyName" isRequired="true"/>
    </AttributeConsumingService>
  </SPSSODescriptor>
</EntityDescriptor>
```

---

## 🧪 Testing

### Ambienti di Test

- **SPID Test**: https://demo.spid.gov.it
- **CIE Test**: https://collaudo.idserver.servizicie.interno.gov.it
- **PosteID Test**: Richiedi ambiente sandbox a Poste

### Identity Provider Demo

- **spid-testenv2**: Simulatore SPID locale
  ```bash
  docker run -p 8088:8088 italia/spid-testenv2
  ```

---

## 📚 Risorse Utili

### Documentazione Ufficiale

- **SPID**: https://docs.italia.it/italia/spid/
- **CIE**: https://docs.italia.it/italia/cie/
- **AgID Linee Guida**: https://www.agid.gov.it/it/piattaforme/spid/linee-guida

### Librerie Open Source

- **spid-express**: https://github.com/italia/spid-express
- **spid-saml-check**: Tool validazione metadati SPID
- **cie-oidc-nodejs**: https://github.com/italia/cie-oidc-nodejs

### Supporto Tecnico

- **Forum SPID**: https://forum.italia.it/c/spid
- **GitHub AgID**: https://github.com/italia

---

## ⚠️ Note Importanti

1. **Costi**: L'integrazione SPID richiede certificati qualificati (~500€/anno)
2. **Tempi**: 3-6 mesi per completare tutta la procedura
3. **Compliance**: Rispettare GDPR e normative AgID
4. **Accessibilità**: SPID deve rispettare WCAG 2.1 AA
5. **Backup**: Mantenere sempre login email/password come fallback

---

## 🎯 Roadmap Implementazione

### Fase 1: Setup Iniziale (Settimana 1-2)

- [ ] Contattare ufficio IT università
- [ ] Avviare pratica AgID per SPID
- [ ] Richiedere convenzione CIE
- [ ] Contattare Poste per PosteID

### Fase 2: Sviluppo (Settimana 3-4)

- [ ] Installare librerie SAML/OIDC
- [ ] Configurare provider in NextAuth
- [ ] Implementare UI login
- [ ] Testing con environment demo

### Fase 3: Certificazione (Settimana 5-8)

- [ ] Ottenere certificati digitali
- [ ] Esporre metadati pubblici
- [ ] Superare test validatore SPID
- [ ] Ottenere approvazione AgID

### Fase 4: Deploy (Settimana 9-10)

- [ ] Deploy produzione
- [ ] Attivazione provider
- [ ] Monitoring e logging
- [ ] Documentazione utenti

---

## 💡 Raccomandazioni per Progetto Universitario

Per un **progetto accademico/demo**, è **sufficiente** implementare:

✅ **Google OAuth** (già implementato)

- Universale, semplice, veloce
- Supporta domini universitari (@studenti.unisa.it)

✅ **Email/Password** (già implementato)

- Sempre necessario come fallback
- No dipendenze esterne

📝 **SPID/CIE/PosteID** (opzionale)

- Documentare come "feature futura"
- Preparare architettura per integrazione
- Mostrare nei requisiti non funzionali

---

**Per produzione reale in biblioteca universitaria**, seguire questa guida completa per integrazione SPID/CIE conforme a normative AgID.
