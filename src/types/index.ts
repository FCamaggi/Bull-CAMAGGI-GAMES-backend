/**
 * Tipos principales para el juego Bull
 */

// Estados posibles del lobby
export type LobbyStatus = 'waiting' | 'playing' | 'finished';

// Equipos disponibles
export type Team = 'blue' | 'red';

// Estados de una ronda
export type RoundStatus = 'answering' | 'voting' | 'finished';

// Interfaz del jugador
export interface Player {
  id: string; // UUID único
  name: string; // Nombre del jugador
  team?: Team; // Equipo seleccionado (opcional hasta que elija)
  isHost: boolean; // Si es el host del lobby
  socketId: string; // ID de la conexión WebSocket
  score: number; // Puntuación actual
  isReady: boolean; // Si está listo para comenzar
  isConnected: boolean; // Estado de conexión
}

// Interfaz del lobby
export interface Lobby {
  code: string; // Código del lobby (ej: "ABC123")
  hostId: string; // ID del jugador host
  hostSocketId: string; // Socket ID del host
  players: Player[]; // Lista de jugadores (NO incluye host)
  teams: {
    blue: Player[]; // Equipo azul
    red: Player[]; // Equipo rojo
  };
  status: LobbyStatus; // Estado actual del lobby
  createdAt: Date; // Fecha de creación
  lastActivity: Date; // Última actividad (para cleanup)
  gameState?: BullGameState; // Estado del juego cuando está activo
  settings: GameSettings; // Configuración del juego
}

// Configuración del juego
export interface GameSettings {
  maxRounds: number; // Número máximo de rondas (default: 5)
  answerTimeSeconds: number; // Tiempo para escribir respuesta (default: 30)
  voteTimeSeconds: number; // Tiempo para votar (default: 20)
  pointsCorrectAnswer: number; // Puntos por respuesta correcta (default: 100)
  pointsConfuseOpponent: number; // Puntos por confundir oponente (default: 50)
}

// Estado completo del juego Bull
export interface BullGameState {
  currentRound: number; // Ronda actual (1-indexed)
  totalRounds: number; // Total de rondas configuradas
  phase: GamePhase; // Fase actual del juego
  rounds: BullRound[]; // Historial de rondas
  scores: {
    blue: number; // Puntuación equipo azul
    red: number; // Puntuación equipo rojo
  };
  timeRemaining?: number; // Tiempo restante en segundos
  winner?: Team; // Ganador del juego (cuando termina)
}

// Fases del juego
export type GamePhase =
  | 'waiting' // Esperando que empiece
  | 'writing' // Jugadores escriben respuestas falsas
  | 'voting' // Jugadores votan
  | 'results' // Mostrando resultados de la ronda
  | 'finished'; // Juego terminado

// Ronda individual del juego Bull
export interface BullRound {
  number: number; // Número de la ronda
  question: string; // Pregunta de la ronda
  correctAnswer: string; // Respuesta correcta
  incorrectAnswer: string; // Respuesta incorrecta (distractor base)
  suggestedFormat?: string; // Formato sugerido para la respuesta
  selectedPlayers: {
    // Jugadores seleccionados para esta ronda
    blue: Player;
    red: Player;
  };
  playerAnswers: { [playerId: string]: string }; // Respuestas de jugadores
  playersReady: { [playerId: string]: boolean }; // Jugadores que marcaron "Listo"
  options: RoundOption[]; // 4 opciones finales (mezcladas)
  votes: { [playerId: string]: string }; // Votos (playerId -> optionId)
  status: RoundStatus; // Estado de la ronda
  pointsAwarded: { [playerId: string]: number }; // Puntos ganados por jugador
  startedAt: Date; // Cuándo empezó la ronda
  finishedAt?: Date; // Cuándo terminó la ronda
}

// Opción de respuesta en una ronda
export interface RoundOption {
  id: string; // ID único de la opción
  text: string; // Texto de la respuesta
  origin: OptionOrigin; // De dónde viene esta respuesta
  position: number; // Posición en el array (1-4)
}

// Origen de una opción de respuesta
export type OptionOrigin =
  | { type: 'correct' } // Respuesta correcta
  | { type: 'incorrect' } // Respuesta incorrecta base
  | { type: 'player'; playerId: string }; // Respuesta de un jugador

// Eventos WebSocket del cliente al servidor
export interface ClientToServerEvents {
  // Eventos de lobby
  create_lobby: (data: { playerName: string }) => void;
  join_lobby: (data: { code: string; playerName: string }) => void;
  leave_lobby: () => void;
  select_team: (data: { team: Team }) => void;
  ready_toggle: () => void;

  // Eventos de juego (solo host)
  start_game: (settings?: Partial<GameSettings>) => void;
  next_phase: () => void;
  reset_game: () => void;

  // Eventos de ronda
  submit_answer: (data: { answer: string }) => void;
  player_ready: () => void;
  submit_vote: (data: { optionId: string }) => void;

  // Eventos de conexión
  ping: () => void;
  reconnect_attempt: (data: { playerId: string; lobbyCode: string }) => void;
}

// Eventos WebSocket del servidor al cliente
export interface ServerToClientEvents {
  // Eventos de lobby
  lobby_created: (data: { lobby: Lobby; playerId: string }) => void;
  lobby_joined: (data: { lobby: Lobby; playerId: string }) => void;
  lobby_updated: (data: { lobby: Lobby }) => void;
  player_joined: (data: { player: Player }) => void;
  player_left: (data: { playerId: string }) => void;
  team_updated: (data: { teams: Lobby['teams'] }) => void;

  // Eventos de juego
  game_started: (data: { gameState: BullGameState }) => void;
  game_finished: (data: {
    winner: Team;
    finalScores: BullGameState['scores'];
  }) => void;

  // Eventos de ronda
  round_started: (data: { round: BullRound; timeRemaining: number }) => void;
  writing_phase: (data: { timeRemaining: number }) => void;
  voting_phase: (data: {
    options: RoundOption[];
    timeRemaining: number;
  }) => void;
  round_results: (data: { 
    results: RoundResult; 
    nextRound?: number;
    options?: RoundOption[];
    votes?: { [playerId: string]: string };
  }) => void;

  // Eventos de estado
  game_state_updated: (data: { gameState: BullGameState }) => void;
  time_update: (data: { timeRemaining: number }) => void;

  // Eventos de error
  error: (data: { message: string; code?: string }) => void;
  validation_error: (data: { field: string; message: string }) => void;

  // Eventos de conexión
  pong: () => void;
  reconnected: (data: { lobby: Lobby; gameState?: BullGameState }) => void;
}

// Resultado de una ronda
export interface RoundResult {
  roundNumber: number;
  question: string;
  correctOptionId: string;
  votes: { [playerId: string]: { optionId: string; isCorrect: boolean } };
  pointsAwarded: { [playerId: string]: number };
  newScores: { blue: number; red: number };
  confusionResults: {
    // Quién confundió a quién
    [playerId: string]: string[]; // Array de IDs de jugadores confundidos
  };
}

// Datos de sesión (en memoria)
export interface SessionData {
  playerId: string;
  lobbyCode: string;
  joinedAt: Date;
  lastSeen: Date;
}

// Configuración del servidor
export interface ServerConfig {
  port: number;
  frontendUrl: string;
  maxLobbies: number;
  lobbyExpiryHours: number;
  defaultGameSettings: GameSettings;
}

// Errores personalizados
export interface GameError {
  code: string;
  message: string;
  statusCode: number;
}

// Estadísticas básicas del servidor
export interface ServerStats {
  activeLobbies: number;
  totalPlayers: number;
  gamesInProgress: number;
  uptime: number;
}
