import { LOBBY_CODE_LENGTH, LOBBY_CODE_CHARS } from './constants';

/**
 * Genera un código único para el lobby
 */
export function generateLobbyCode(): string {
  let code = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * LOBBY_CODE_CHARS.length);
    code += LOBBY_CODE_CHARS.charAt(randomIndex);
  }
  return code;
}

/**
 * Genera un código único que no exista en el conjunto dado
 */
export function generateUniqueLobbyCode(existingCodes: Set<string>): string {
  let code: string;
  let attempts = 0;
  const maxAttempts = 100;
  
  do {
    code = generateLobbyCode();
    attempts++;
    
    if (attempts > maxAttempts) {
      throw new Error('No se pudo generar un código único después de múltiples intentos');
    }
  } while (existingCodes.has(code));
  
  return code;
}

/**
 * Valida si un código de lobby es válido
 */
export function isValidLobbyCode(code: string): boolean {
  if (code.length !== LOBBY_CODE_LENGTH) {
    return false;
  }
  
  return code.split('').every(char => LOBBY_CODE_CHARS.includes(char));
}

/**
 * Normaliza un código de lobby (mayúsculas)
 */
export function normalizeLobbyCode(code: string): string {
  return code.toUpperCase().trim();
}