// ============================================
// PASSWORD UTILITIES - BiblioFlow
// ============================================
// Funzioni per hashing e verifica password
// Separato da auth.ts per compatibilità Edge Runtime

import bcrypt from "bcryptjs";

/**
 * Hash della password con bcrypt
 * Usa un salt factor di 12 per sicurezza
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verifica la password
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Valida la forza della password
 * Ritorna un oggetto con il risultato e i messaggi
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push("La password deve avere almeno 8 caratteri");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera maiuscola");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera minuscola");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("La password deve contenere almeno un numero");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
