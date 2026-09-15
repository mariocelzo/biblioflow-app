/// <reference lib="webworker" />

/**
 * 🔧 BiblioFlow Service Worker
 *
 * Gestisce:
 * - Cache strategica per performance
 * - Offline fallback
 * - Push notifications
 * - Background sync
 */

// v2 (2026-09-15): vedi i due blocchi di commenti qui sotto (PRECACHE_URLS e
// la sezione "CACHE RUNTIME DELLE API") per il perche' del bump di versione.
// L'evento `activate` cancella ogni cache con nome diverso da questo, quindi
// bump = i client gia' installati scaricano da capo lo shell E perdono le
// eventuali risposte di /api/* che la v1 aveva gia' salvato su disco (vedi
// sotto: era un problema di privacy su un PC condiviso, non solo un dettaglio
// tecnico).
const CACHE_NAME = 'biblioflow-v2';
const OFFLINE_URL = '/offline.html';

// Risorse da pre-cachare (app shell)
//
// PERCHE' QUESTO ELENCO ERA SBAGLIATO (difetto reale, verificato in
// produzione: `navigator.serviceWorker.getRegistrations()` restituiva `[]`
// nonostante `register('/sw.js')` risolvesse con successo):
// `cache.addAll()` e' ATOMICO — se anche una sola URL risponde con un errore
// (4xx/5xx), l'intera `install` fallisce e il service worker viene scartato
// SILENZIOSAMENTE (nessun errore visibile all'utente, il sito continua a
// funzionare senza SW e basta). Qui c'erano tre voci che non esistevano mai:
//   - /icons/icon-192x192.png e /icons/icon-512x512.png: in public/icons/
//     ci sono solo icon-192.svg e icon-512.svg (verificato con `ls`), le
//     due PNG non sono mai esistite.
//   - /offline: non e' una rotta Next.js (nessun src/app/offline/page.tsx),
//     solo il file statico public/offline.html.
// Ogni voce qui sotto e' stata verificata con `curl -o /dev/null -w
// "%{http_code}" http://localhost:3310/<path>` sul dev server prima di
// essere inclusa: tutte rispondono 200.
//
// `/manifest.json` NON e' in elenco. Oggi (curl confermato: 307) il
// middleware lo reindirizza a /login, perche' la rotta non e' fra quelle
// pubbliche di `src/middleware.ts` e la sua regex di esclusione dei file
// statici copre le estensioni immagine/css/js ma non `.json`. C'e' gia' una
// PR (#68, non ancora mergiata) che sistema il middleware per questo caso:
// di proposito questa lista NON dipende da quella PR, perche' se venisse
// inclusa oggi `cache.addAll()` seguirebbe il redirect e metterebbe in cache
// la PAGINA DI LOGIN sotto la chiave "/manifest.json" — un errore silenzioso
// anche peggiore del 404 originale. Quando #68 sara' mergiata e verificata
// con lo stesso curl, si potra' aggiungere qui.
//
// `/offline.html` (il file HTML vero, a differenza di `/offline`) HA LO
// STESSO PROBLEMA di `/manifest.json`: anche le estensioni `.html` non sono
// escluse dal middleware, quindi un visitatore SENZA sessione valida viene
// rediretto a /login pure su questo file (curl confermato: 307). Per questo
// non e' nemmeno lui nell'elenco atomico qui sotto: viene pre-cachato a
// parte, in modo da non far fallire l'installazione dell'intero shell se in
// quel momento il redirect scatta (vedi `precacheOfflineFallback()` piu' in
// basso, che scarta la risposta se e' un redirect invece di salvarla).
const PRECACHE_URLS = [
  '/',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// ============================================================================
// CACHE RUNTIME DELLE API: NESSUNA, di proposito (privacy)
// ============================================================================
// Prima qui c'era un elenco `RUNTIME_CACHE_URLS` con /api/posti, /api/sale,
// /api/libri. In realta' quell'elenco non veniva mai letto da nessuna parte
// del file (verificato con grep): il comportamento REALE era che l'handler
// `fetch` sotto instrada QUALSIASI richiesta GET con path che inizia per
// "/api/" — non solo le tre elencate — a `networkFirst()`, che salva ogni
// risposta riuscita nella Cache Storage.
//
// Perche' e' un problema di privacy, verificato leggendo gli handler:
// `src/app/api/posti/route.ts`, `.../sale/route.ts` e `.../libri/route.ts`
// chiamano tutti `requireUser()` — sono dati dietro login, non un catalogo
// pubblico — e lo stesso vale per praticamente ogni altra rotta /api/ che un
// utente autenticato puo' chiamare da browser (fanno eccezione solo
// /api/auth/*, /api/health e /api/cron/*, che pero' non sono percorsi GET
// interessanti da mettere in cache). La Cache Storage e' condivisa da TUTTE
// le sessioni della stessa origine nello stesso browser: su un PC condiviso,
// o semplicemente dopo un logout seguito dal login di un'altra persona sullo
// stesso dispositivo, `networkFirst()` puo' servire — quando la rete e'
// lenta o assente — la risposta JSON salvata per l'utente PRECEDENTE (es.
// quali posti aveva prenotato, lo stato delle sue richieste). Non serve
// nemmeno essere offline "per davvero": una rete che va in timeout basta a
// far scattare il fallback alla cache.
//
// Non esiste, fra le rotte raggiungibili dal service worker, un sottoinsieme
// di dati "non personali" da poter cachare in sicurezza: sono tutte dietro
// `requireUser()`. La scelta quindi e' semplicemente NON persistere MAI le
// risposte di /api/* nella Cache Storage — vedi `networkOnlyApi()` piu' in
// basso, che fa solo `fetch` e non tocca mai `caches`. Il bump di
// CACHE_NAME a v2 (in cima al file) serve proprio a svuotare, per chi aveva
// gia' installato la v1, qualunque risposta di /api/* salvata prima di
// questo fix.

// Install event - pre-cache app shell
self.addEventListener('install', (event) => {
  console.log('📦 Service Worker: Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('📦 Service Worker: Pre-caching app shell');
        // Elenco atomico: ogni voce qui e' stata verificata con curl (200
        // certo, non dietro auth). Se una di queste comincia a fallire,
        // VOGLIAMO che l'installazione fallisca rumorosamente, come prima:
        // e' il segnale che l'elenco va corretto di nuovo.
        await cache.addAll(PRECACHE_URLS);
        // La pagina offline invece e' "best effort": vedi il commento sulla
        // funzione per il perche' non puo' stare nell'addAll qui sopra.
        await precacheOfflineFallback(cache);
      })
      .then(() => {
        console.log('✅ Service Worker: Installed');
        return self.skipWaiting();
      })
  );
});

/**
 * Pre-cache di /offline.html, separata dall'elenco atomico.
 *
 * PERCHE' NON PUO' STARE IN `cache.addAll(PRECACHE_URLS)`: quella chiamata
 * SEGUE i redirect in automatico e considera "riuscita" anche una risposta
 * 200 ottenuta dopo un redirect — cioe' la metterebbe in cache comunque,
 * ma con il contenuto sbagliato (la pagina di login) sotto la chiave giusta
 * (/offline.html). Un utente davvero offline vedrebbe il form di login al
 * posto dell'avviso "sei offline", il che e' anche piu' fuorviante del
 * 503 generico che si otterrebbe senza pre-cache.
 *
 * Qui invece si legge `response.redirected`: se e' true (middleware che ha
 * rediretto a /login perche' la richiesta non aveva una sessione valida —
 * vedi il commento su PRECACHE_URLS) si scarta la risposta e si prosegue
 * senza cachare nulla, senza far fallire l'installazione. Quando l'utente
 * installa il service worker da autenticato (il caso comune: la richiesta
 * di permesso/registrazione avviene dopo il login), il redirect non scatta
 * e la vera pagina offline viene salvata normalmente.
 */
async function precacheOfflineFallback(cache) {
  try {
    const response = await fetch(OFFLINE_URL, { cache: 'no-store' });
    if (response.ok && !response.redirected) {
      await cache.put(OFFLINE_URL, response);
    } else {
      console.warn(
        '⚠️ Service Worker: pagina offline non pre-cachata (risposta non valida o redirect — probabile middleware auth su utente non autenticato)',
      );
    }
  } catch (error) {
    console.error('⚠️ Service Worker: pre-cache della pagina offline fallita', error);
  }
}

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker: Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('🗑️ Service Worker: Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - cache strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // API: MAI persistite in cache. Vedi il commento "CACHE RUNTIME DELLE API"
  // in cima al file per il perche' (dati dietro login, rischio privacy su
  // dispositivo condiviso).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnlyApi(request));
    return;
  }

  // Static assets: Cache-first (sicuro: sono file statici non personalizzati,
  // identici per qualsiasi utente)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pagine HTML: rete con fallback alla pagina offline pre-cachata.
  //
  // PRIMA questa strategia salvava anche le pagine HTML in cache
  // (`cache.put` dopo ogni risposta riuscita). Quasi tutte le pagine
  // dell'app pero' mostrano dati personali dietro login (prenotazioni,
  // notifiche, profilo, area admin...): esattamente lo stesso rischio di
  // privacy spiegato sopra per le API, ma per intere pagine invece che per
  // singole risposte JSON. Per questo ora NON si scrive mai in cache qui:
  // offline si vede la pagina offline generica, non l'ultima pagina
  // personale vista (magari da un altro utente dello stesso dispositivo).
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkWithOfflineFallback(request));
    return;
  }

  // Default: rete, senza cache (stesso ragionamento delle pagine HTML: non
  // sappiamo a priori se la risposta contiene dati personali).
  event.respondWith(networkOnlyApi(request));
});

// Cache-first strategy (per static assets)
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache-first fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Solo rete, senza mai leggere ne' scrivere la Cache Storage.
 *
 * Usata per /api/* e come strategia di default: vedi il commento "CACHE
 * RUNTIME DELLE API" in cima al file. Il fallback offline e' un JSON
 * generico — mai una risposta salvata in precedenza, che potrebbe
 * appartenere a un altro utente dello stesso browser.
 */
async function networkOnlyApi(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Rete per le pagine HTML, con fallback alla pagina offline pre-cachata.
 *
 * Non scrive mai in `caches` (vedi il commento sopra l'uso di questa
 * funzione nell'handler `fetch`): se la rete fallisce si mostra SEMPRE
 * `/offline.html` cosi' come pre-cachato in `install` — mai una pagina
 * personale salvata in precedenza.
 */
async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const paginaOffline = await caches.match(OFFLINE_URL);
    return paginaOffline || new Response('Offline', { status: 503 });
  }
}

// Push notification event
self.addEventListener('push', (event) => {
  console.log('🔔 Push notification received');

  let data = {
    title: 'BiblioFlow',
    body: 'Hai una nuova notifica',
    // Stesso difetto delle voci corrette in PRECACHE_URLS: questi due file
    // PNG non sono mai esistiti in public/icons/ (ci sono solo le .svg).
    // Qui non fanno fallire nulla (showNotification() li richiede al volo,
    // non tramite cache.addAll), ma senza icona valida il browser non
    // mostra nessuna icona nella notifica invece di quella di BiblioFlow.
    // Non esiste un asset "badge" dedicato: si riusa l'icona principale.
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: 'default',
    data: { url: '/notifiche' },
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: 'Apri' },
        { action: 'close', title: 'Chiudi' },
      ],
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event.notification.tag);

  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se c'è già una finestra aperta, focalizzala
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Altrimenti apri una nuova finestra
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync event (per prenotazioni offline)
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync:', event.tag);

  if (event.tag === 'sync-prenotazioni') {
    event.waitUntil(syncPrenotazioni());
  }
});

// Sync prenotazioni salvate offline
async function syncPrenotazioni() {
  // In futuro: recupera prenotazioni salvate in IndexedDB e inviale al server
  console.log('🔄 Syncing offline bookings...');
}

console.log('🚀 BiblioFlow Service Worker loaded');
