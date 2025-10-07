import { GameSettings } from '../types';

/**
 * Configuración por defecto del servidor
 */
export const DEFAULT_PORT = 3001;
export const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

/**
 * Configuración por defecto del juego
 */
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  maxRounds: 5,
  answerTimeSeconds: 30,
  voteTimeSeconds: 20,
  pointsCorrectAnswer: 100,
  pointsConfuseOpponent: 150,
};

/**
 * Constantes del lobby
 */
export const LOBBY_CODE_LENGTH = 6;
export const LOBBY_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const MAX_PLAYERS_PER_LOBBY = 8;
export const MIN_PLAYERS_TO_START = 2;
export const MAX_LOBBIES = 100;
export const LOBBY_EXPIRY_HOURS = 2;

/**
 * Constantes del juego
 */
export const MIN_ANSWER_LENGTH = 1;
export const MAX_ANSWER_LENGTH = 120;
export const ROUND_OPTIONS_COUNT = 4;

/**
 * Tiempos en milisegundos
 */
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 segundos
export const RECONNECT_WINDOW_MS = 60 * 1000; // 1 minuto

/**
 * Códigos de error
 */
export const ERROR_CODES = {
  LOBBY_NOT_FOUND: 'LOBBY_NOT_FOUND',
  LOBBY_FULL: 'LOBBY_FULL',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  NOT_HOST: 'NOT_HOST',
  INVALID_TEAM: 'INVALID_TEAM',
  INVALID_PHASE: 'INVALID_PHASE',
  ANSWER_TOO_LONG: 'ANSWER_TOO_LONG',
  ANSWER_TOO_SHORT: 'ANSWER_TOO_SHORT',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  TIME_EXPIRED: 'TIME_EXPIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_FULL: 'SERVER_FULL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
