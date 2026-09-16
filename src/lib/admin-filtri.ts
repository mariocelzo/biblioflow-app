// Validazione dei filtri a valori enum nelle liste admin.
//
// PERCHE' QUESTO FILE: i filtri di /admin/posti, /admin/prenotazioni,
// /admin/prestiti e /admin/utenti leggono `stato`/`ruolo` dalla query string
// e li passavano a Prisma con un semplice `as EnumType`. Un valore che non
// appartiene all'enum - tipico di una URL digitata a mano, es.
// `/admin/posti?stato=PIPPO` - arriva cosi' intatto nella clausola `where`:
// Prisma lo rifiuta con una PrismaClientValidationError e la pagina risponde
// con un errore del server invece di ignorare un filtro inutilizzabile.
//
// Lo stesso rischio era gia' stato trovato altrove nel progetto (vedi
// tests/post-modifica/api-enum-validazione-db.test.ts, che cita
// `/api/sale?piano=abc` e le GET di /api/prenotazioni, /api/posti,
// /api/admin/richieste): li' si tratta di endpoint JSON e la risposta
// corretta e' un 422 esplicito. Qui invece sono pagine HTML: il
// comportamento corretto e' ignorare il filtro non valido - equivalente a
// "tutti" - piuttosto che far esplodere il render.
//
// `enumObject` e' l'oggetto enum generato a runtime da Prisma (es.
// `StatoPosto` importato da "@prisma/client", non solo il tipo): usarlo
// invece di riscrivere a mano l'elenco dei valori ammessi impedisce che la
// lista si disallinei dallo schema quando l'enum cambia.
export function valoreEnumAmmesso<T extends string>(
  enumObject: Record<string, T>,
  valore: string | undefined,
): T | undefined {
  if (!valore) return undefined;
  return (Object.values(enumObject) as string[]).includes(valore)
    ? (valore as T)
    : undefined;
}
