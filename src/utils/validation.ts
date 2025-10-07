import { z } from 'zod';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH, ERROR_CODES } from './constants';
import type { Team, GameSettings } from '../types';

/**
 * Esquema de validación para crear lobby
 */
export const CreateLobbySchema = z.object({
  playerName: z.string()
    .min(1, 'El nombre es obligatorio')
    .max(50, 'El nombre no puede tener más de 50 caracteres')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'El nombre solo puede contener letras, números, espacios, guiones y guiones bajos'),
});

/**
 * Esquema de validación para unirse a lobby
 */
export const JoinLobbySchema = z.object({
  code: z.string()
    .length(6, 'El código debe tener exactamente 6 caracteres')
    .regex(/^[A-Z0-9]+$/, 'El código solo puede contener letras mayúsculas y números'),
  playerName: z.string()
    .min(1, 'El nombre es obligatorio')
    .max(50, 'El nombre no puede tener más de 50 caracteres')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'El nombre solo puede contener letras, números, espacios, guiones y guiones bajos'),
});

/**
 * Esquema de validación para seleccionar equipo
 */
export const SelectTeamSchema = z.object({
  team: z.enum(['blue', 'red'], {
    errorMap: () => ({ message: 'El equipo debe ser "blue" o "red"' })
  }),
});

/**
 * Esquema de validación para respuesta de jugador
 */
export const SubmitAnswerSchema = z.object({
  answer: z.string()
    .min(MIN_ANSWER_LENGTH, `La respuesta debe tener al menos ${MIN_ANSWER_LENGTH} caracter`)
    .max(MAX_ANSWER_LENGTH, `La respuesta no puede tener más de ${MAX_ANSWER_LENGTH} caracteres`)
    .trim(),
});

/**
 * Esquema de validación para voto
 */
export const SubmitVoteSchema = z.object({
  optionId: z.string()
    .min(1, 'Debe seleccionar una opción')
    .uuid('ID de opción inválido'),
});

/**
 * Esquema de validación para configuración del juego
 */
export const GameSettingsSchema = z.object({
  maxRounds: z.number()
    .int('El número de rondas debe ser un entero')
    .min(1, 'Debe haber al menos 1 ronda')
    .max(20, 'No puede haber más de 20 rondas')
    .optional(),
  answerTimeSeconds: z.number()
    .int('El tiempo debe ser un entero')
    .min(10, 'El tiempo mínimo para responder es 10 segundos')
    .max(300, 'El tiempo máximo para responder es 5 minutos')
    .optional(),
  voteTimeSeconds: z.number()
    .int('El tiempo debe ser un entero')
    .min(5, 'El tiempo mínimo para votar es 5 segundos')
    .max(120, 'El tiempo máximo para votar es 2 minutos')
    .optional(),
  pointsCorrectAnswer: z.number()
    .int('Los puntos deben ser un entero')
    .min(1, 'Los puntos por respuesta correcta deben ser al menos 1')
    .max(1000, 'Los puntos por respuesta correcta no pueden ser más de 1000')
    .optional(),
  pointsConfuseOpponent: z.number()
    .int('Los puntos deben ser un entero')
    .min(1, 'Los puntos por confundir oponente deben ser al menos 1')
    .max(1000, 'Los puntos por confundir oponente no pueden ser más de 1000')
    .optional(),
});

/**
 * Clase de error personalizada para validaciones
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code: string = ERROR_CODES.VALIDATION_ERROR
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Valida datos usando un schema de Zod
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      throw new ValidationError(
        firstIssue?.message || 'Datos inválidos',
        firstIssue?.path.join('.'),
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    throw error;
  }
}

/**
 * Valida si un nombre de jugador es único en el lobby
 */
export function validateUniquePlayerName(playerName: string, existingNames: string[]): void {
  const normalizedName = playerName.toLowerCase().trim();
  const normalizedExisting = existingNames.map(name => name.toLowerCase().trim());
  
  if (normalizedExisting.includes(normalizedName)) {
    throw new ValidationError('Ya hay un jugador con ese nombre en el lobby', 'playerName');
  }
}

/**
 * Valida si un equipo tiene espacio disponible
 */
export function validateTeamCapacity(team: Team, teams: { blue: any[]; red: any[] }): void {
  const maxPerTeam = 4; // Máximo 4 jugadores por equipo
  
  if (teams[team].length >= maxPerTeam) {
    throw new ValidationError(`El equipo ${team} está lleno`, 'team');
  }
}

/**
 * Sanitiza texto para evitar contenido inapropiado básico
 */
export function sanitizeText(text: string): string {
  return text
    .trim()                           // Quitar espacios al inicio/final
    .replace(/\s+/g, ' ')            // Normalizar espacios múltiples
    .replace(/[<>]/g, '')            // Quitar caracteres potencialmente peligrosos
    .substring(0, MAX_ANSWER_LENGTH); // Truncar si es muy largo
}