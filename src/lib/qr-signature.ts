import crypto from 'crypto';

const QR_SECRET = process.env.QR_SECRET || 'biblioflow-qr-secret-2026-unisa';

export interface QRPayload {
  prenotazioneId: string;
  userId: string;
  timestamp: number;
}

/**
 * Genera una firma HMAC per il QR code
 */
export function signQRCode(payload: QRPayload): string {
  const data = `${payload.prenotazioneId}:${payload.userId}:${payload.timestamp}`;
  return crypto
    .createHmac('sha256', QR_SECRET)
    .update(data)
    .digest('hex');
}

/**
 * Verifica la firma di un QR code
 */
export function verifyQRCode(payload: QRPayload, signature: string): boolean {
  try {
    const expectedSignature = signQRCode(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Verifica se il QR code è ancora valido (non scaduto)
 */
export function isQRValid(timestamp: number, validityMinutes: number = 15): boolean {
  const now = Date.now();
  const elapsed = (now - timestamp) / 1000 / 60; // minuti
  return elapsed <= validityMinutes;
}

/**
 * Genera un QR code firmato completo
 */
export function generateSignedQR(prenotazioneId: string, userId: string): string {
  const payload: QRPayload = {
    prenotazioneId,
    userId,
    timestamp: Date.now(),
  };
  
  const signature = signQRCode(payload);
  
  const qrData = {
    ...payload,
    signature,
    version: '1.0',
    issuer: 'BiblioFlow-UNISA',
  };
  
  return JSON.stringify(qrData);
}

/**
 * Valida e decodifica un QR code scansionato
 */
export function validateScannedQR(qrString: string): {
  valid: boolean;
  payload?: QRPayload;
  error?: string;
  errorType?: 'expired' | 'fake' | 'invalid' | 'malformed';
} {
  try {
    const data = JSON.parse(qrString);
    
    // Verifica issuer per essere sicuri che sia un nostro QR
    if (data.issuer !== 'BiblioFlow-UNISA') {
      return { 
        valid: false, 
        error: 'QR Code non valido: non è un QR BiblioFlow',
        errorType: 'invalid'
      };
    }
    
    // Verifica campi obbligatori
    if (!data.prenotazioneId || !data.userId || !data.timestamp || !data.signature) {
      return { 
        valid: false, 
        error: 'QR Code non valido: campi mancanti',
        errorType: 'malformed'
      };
    }
    
    const payload: QRPayload = {
      prenotazioneId: data.prenotazioneId,
      userId: data.userId,
      timestamp: data.timestamp,
    };
    
    // Verifica firma
    if (!verifyQRCode(payload, data.signature)) {
      return { 
        valid: false, 
        error: 'QR Code contraffatto: firma non valida',
        errorType: 'fake'
      };
    }
    
    // Verifica scadenza
    if (!isQRValid(data.timestamp)) {
      return { 
        valid: false, 
        error: 'QR Code scaduto (valido solo 15 minuti)',
        errorType: 'expired'
      };
    }
    
    return { valid: true, payload };
    
  } catch {
    return { 
      valid: false, 
      error: 'QR Code non leggibile o formato non valido',
      errorType: 'malformed'
    };
  }
}
