import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionData,
  Lobby,
  Player,
  Team,
  GameSettings,
} from '../types';
import { LobbyService, LobbyError } from './lobbyService';
import { GameService, GameError } from './gameService';
import { generateUUID } from '../utils/helpers';
import { ERROR_CODES } from '../utils/constants';

/**
 * Servicio para manejar las conexiones WebSocket y eventos del juego
 */
export class SocketService {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private lobbyService: LobbyService;
  private gameService: GameService;
  private sessions = new Map<string, SessionData>(); // Actualizar estado del juego
  private timers = new Map<string, NodeJS.Timeout>(); // lobbyCode -> timer

  constructor(
    httpServer: HttpServer,
    corsOrigin: string,
    lobbyService: LobbyService,
    gameService: GameService
  ) {
    // Permitir múltiples orígenes para Socket.io
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3002',
      corsOrigin,
    ].filter(Boolean);

    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);

          const isAllowed = allowedOrigins.some(
            (allowed) => origin === allowed || origin.endsWith('.netlify.app')
          );

          callback(null, isAllowed);
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.lobbyService = lobbyService;
    this.gameService = gameService;

    this.setupEventHandlers();
  }

  /**
   * Configura los manejadores de eventos de Socket.io
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Maneja una nueva conexión WebSocket
   */
  private handleConnection(socket: Socket): void {
    console.log(`🔌 Nueva conexión WebSocket: ${socket.id}`);

    // Eventos de lobby
    socket.on('create_lobby', (data) => this.handleCreateLobby(socket, data));
    socket.on('join_lobby', (data) => this.handleJoinLobby(socket, data));
    socket.on('leave_lobby', () => this.handleLeaveLobby(socket));
    socket.on('select_team', (data) => this.handleSelectTeam(socket, data));
    socket.on('ready_toggle', () => this.handleReadyToggle(socket));

    // Eventos de juego (host)
    socket.on('start_game', (settings) =>
      this.handleStartGame(socket, settings)
    );
    socket.on('next_phase', () => this.handleNextPhase(socket));
    socket.on('reset_game', () => this.handleResetGame(socket));

    // Eventos de ronda
    socket.on('submit_answer', (data) => this.handleSubmitAnswer(socket, data));
    socket.on('player_ready', () => this.handlePlayerReady(socket));
    socket.on('submit_vote', (data) => this.handleSubmitVote(socket, data));

    // Eventos de conexión
    socket.on('ping', () => socket.emit('pong'));
    socket.on('reconnect_attempt', (data) =>
      this.handleReconnectAttempt(socket, data)
    );

    // Manejo de desconexión
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Desconexión WebSocket: ${socket.id}, razón: ${reason}`);
      this.handleDisconnection(socket);
    });
  }

  /**
   * Crea un nuevo lobby
   */
  private async handleCreateLobby(
    socket: Socket,
    data: { playerName: string }
  ): Promise<void> {
    try {
      console.log(`🎯 Creando lobby para: ${data.playerName} (${socket.id})`);
      const { playerName } = data;

      if (!playerName || playerName.trim().length === 0) {
        socket.emit('error', {
          message: 'El nombre es obligatorio',
          code: ERROR_CODES.VALIDATION_ERROR,
        });
        return;
      }

      const { lobby, playerId } = this.lobbyService.createLobby(
        playerName.trim(),
        socket.id
      );

      // Crear sesión
      this.sessions.set(socket.id, {
        playerId,
        lobbyCode: lobby.code,
        joinedAt: new Date(),
        lastSeen: new Date(),
      });

      // Unir al room del lobby
      await socket.join(lobby.code);

      // Enviar confirmación al creador
      socket.emit('lobby_created', { lobby, playerId });

      console.log(
        `Lobby creado: ${lobby.code} por ${playerName} (${playerId})`
      );
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Un jugador se une a un lobby
   */
  private async handleJoinLobby(
    socket: Socket,
    data: { code: string; playerName: string }
  ): Promise<void> {
    try {
      const { code, playerName } = data;

      if (!code || !playerName) {
        socket.emit('error', {
          message: 'Código y nombre son obligatorios',
          code: ERROR_CODES.VALIDATION_ERROR,
        });
        return;
      }

      const { lobby, playerId } = this.lobbyService.joinLobby(
        code.trim().toUpperCase(),
        playerName.trim(),
        socket.id
      );

      // Crear sesión
      this.sessions.set(socket.id, {
        playerId,
        lobbyCode: lobby.code,
        joinedAt: new Date(),
        lastSeen: new Date(),
      });

      // Unir al room del lobby
      await socket.join(lobby.code);

      // Enviar confirmación al jugador
      socket.emit('lobby_joined', { lobby, playerId });

      // Notificar a todos los demás en el lobby
      const newPlayer = lobby.players.find((p) => p.id === playerId);
      if (newPlayer) {
        socket.to(lobby.code).emit('player_joined', { player: newPlayer });

        // Enviar estado actualizado del lobby a todos
        this.io.to(lobby.code).emit('lobby_updated', { lobby });
      }

      console.log(`${playerName} se unió al lobby ${lobby.code}`);
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Un jugador abandona el lobby
   */
  private async handleLeaveLobby(socket: Socket): Promise<void> {
    const session = this.sessions.get(socket.id);
    if (!session) return;

    try {
      const { lobby, wasHost } = this.lobbyService.leaveLobby(
        session.lobbyCode,
        session.playerId
      );

      // Remover sesión
      this.sessions.delete(socket.id);

      // Salir del room
      await socket.leave(session.lobbyCode);

      if (lobby) {
        // Notificar a otros jugadores
        socket
          .to(lobby.code)
          .emit('player_left', { playerId: session.playerId });
        socket.to(lobby.code).emit('lobby_updated', { lobby });

        console.log(`Jugador ${session.playerId} abandonó lobby ${lobby.code}`);
      } else {
        console.log(`Lobby ${session.lobbyCode} eliminado`);
      }
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Un jugador selecciona su equipo
   */
  private handleSelectTeam(socket: Socket, data: { team: Team }): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const { team } = data;

      if (team !== 'blue' && team !== 'red') {
        socket.emit('error', {
          message: 'Equipo inválido',
          code: ERROR_CODES.INVALID_TEAM,
        });
        return;
      }

      const lobby = this.lobbyService.selectTeam(
        session.lobbyCode,
        session.playerId,
        team
      );

      // Actualizar última actividad
      session.lastSeen = new Date();

      // Notificar a todos en el lobby
      this.io.to(lobby.code).emit('team_updated', { teams: lobby.teams });
      this.io.to(lobby.code).emit('lobby_updated', { lobby });
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Toggle del estado ready de un jugador
   */
  private handleReadyToggle(socket: Socket): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const lobby = this.lobbyService.toggleReady(
        session.lobbyCode,
        session.playerId
      );

      // Actualizar última actividad
      session.lastSeen = new Date();

      // Notificar a todos en el lobby
      this.io.to(lobby.code).emit('lobby_updated', { lobby });
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Inicia el juego (solo host)
   */
  private handleStartGame(
    socket: Socket,
    settings?: Partial<GameSettings>
  ): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const lobby = this.lobbyService.getLobby(session.lobbyCode);

      // Verificar que es el host
      if (lobby.hostId !== session.playerId) {
        socket.emit('error', {
          message: 'Solo el host puede iniciar el juego',
          code: ERROR_CODES.NOT_HOST,
        });
        return;
      }

      // Verificar si se puede iniciar
      const { canStart, reason } = this.lobbyService.canStartGame(
        session.lobbyCode
      );
      if (!canStart) {
        socket.emit('error', {
          message: reason || 'No se puede iniciar el juego',
        });
        return;
      }

      // Actualizar configuración si se proporcionó
      if (settings) {
        this.lobbyService.updateGameSettings(
          session.lobbyCode,
          session.playerId,
          settings
        );
      }

      // Iniciar juego
      const gameState = this.gameService.startGame(lobby);

      // Notificar a todos
      this.io.to(lobby.code).emit('game_started', { gameState });

      // Host debe iniciar la primera ronda manualmente

      console.log(`Juego iniciado en lobby ${lobby.code}`);
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Inicia la siguiente ronda o fase
   */
  private handleNextPhase(socket: Socket): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const lobby = this.lobbyService.getLobby(session.lobbyCode);

      // Verificar que es el host
      if (lobby.hostId !== session.playerId) {
        socket.emit('error', {
          message: 'Solo el host puede avanzar fases',
          code: ERROR_CODES.NOT_HOST,
        });
        return;
      }

      if (!lobby.gameState) {
        socket.emit('error', { message: 'No hay juego activo' });
        return;
      }

      this.progressGamePhase(lobby.code);
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Reinicia el juego (solo host)
   */
  private handleResetGame(socket: Socket): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const lobby = this.lobbyService.getLobby(session.lobbyCode);

      // Verificar que es el host
      if (lobby.hostId !== session.playerId) {
        socket.emit('error', {
          message: 'Solo el host puede reiniciar el juego',
          code: ERROR_CODES.NOT_HOST,
        });
        return;
      }

      // Limpiar timer si existe
      const timer = this.timers.get(lobby.code);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(lobby.code);
      }

      // Reiniciar juego
      this.gameService.resetGame(lobby);

      // Notificar a todos
      this.io.to(lobby.code).emit('lobby_updated', { lobby });

      console.log(`Juego reiniciado en lobby ${lobby.code}`);
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Un jugador marca que está listo
   */
  private handlePlayerReady(socket: Socket): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const lobby = this.lobbyService.getLobby(session.lobbyCode);

      this.gameService.markPlayerReady(lobby, session.playerId);

      // Actualizar última actividad
      session.lastSeen = new Date();

      console.log(`Jugador ${session.playerId} marcó listo en ${lobby.code}`);

      // Emitir actualización a todos
      this.io.to(lobby.code).emit('lobby_updated', { lobby });

      // También enviar actualización del estado del juego
      this.io
        .to(session.lobbyCode)
        .emit('game_state_updated', { gameState: lobby.gameState! });

      // Host debe avanzar manualmente cuando todos estén listos
      // Solo notificar que están listos
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Un jugador envía su respuesta
   */
  private handleSubmitAnswer(socket: Socket, data: { answer: string }): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const { answer } = data;

      if (!answer || answer.trim().length === 0) {
        socket.emit('error', {
          message: 'La respuesta no puede estar vacía',
          code: ERROR_CODES.VALIDATION_ERROR,
        });
        return;
      }

      const lobby = this.lobbyService.getLobby(session.lobbyCode);

      this.gameService.submitAnswer(lobby, session.playerId, answer.trim());

      // Actualizar última actividad
      session.lastSeen = new Date();

      console.log(`Respuesta recibida de ${session.playerId} en ${lobby.code}`);

      // Enviar actualización del estado para que el frontend pueda ver el progreso
      this.io
        .to(session.lobbyCode)
        .emit('game_state_updated', { gameState: lobby.gameState! });

      // Host debe avanzar manualmente cuando todos hayan respondido
      // Solo notificar que están listos
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Un jugador vota por una opción
   */
  private handleSubmitVote(socket: Socket, data: { optionId: string }): void {
    const session = this.sessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Sesión no encontrada' });
      return;
    }

    try {
      const { optionId } = data;

      if (!optionId) {
        socket.emit('error', {
          message: 'Debe seleccionar una opción',
          code: ERROR_CODES.VALIDATION_ERROR,
        });
        return;
      }

      const lobby = this.lobbyService.getLobby(session.lobbyCode);

      this.gameService.submitVote(lobby, session.playerId, optionId);

      // Actualizar última actividad
      session.lastSeen = new Date();

      console.log(`Voto recibido de ${session.playerId} en ${lobby.code}`);

      // Enviar actualización del estado para que el frontend pueda ver el progreso
      this.io
        .to(session.lobbyCode)
        .emit('game_state_updated', { gameState: lobby.gameState! });

      // Host debe avanzar manualmente cuando todos hayan votado
      // Solo notificar que están listos
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Intento de reconexión
   */
  private handleReconnectAttempt(
    socket: Socket,
    data: { playerId: string; lobbyCode: string }
  ): void {
    try {
      const { playerId, lobbyCode } = data;

      const lobby = this.lobbyService.getLobby(lobbyCode);
      const player = lobby.players.find((p) => p.id === playerId);

      if (!player) {
        socket.emit('error', { message: 'Jugador no encontrado en el lobby' });
        return;
      }

      // Actualizar socket del jugador
      this.lobbyService.updatePlayerSocket(lobbyCode, playerId, socket.id);

      // Crear nueva sesión
      this.sessions.set(socket.id, {
        playerId,
        lobbyCode,
        joinedAt: new Date(),
        lastSeen: new Date(),
      });

      // Unir al room
      socket.join(lobbyCode);

      // Enviar estado actual
      socket.emit('reconnected', {
        lobby,
        gameState: lobby.gameState,
      });

      console.log(`Jugador ${playerId} reconectado al lobby ${lobbyCode}`);
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Maneja la desconexión de un socket
   */
  private handleDisconnection(socket: Socket): void {
    const session = this.sessions.get(socket.id);
    if (!session) return;

    try {
      // Marcar jugador como desconectado
      const result = this.lobbyService.markPlayerDisconnected(socket.id);

      if (result) {
        // Notificar a otros jugadores
        socket
          .to(result.lobby.code)
          .emit('lobby_updated', { lobby: result.lobby });

        console.log(
          `Jugador ${result.player.name} desconectado del lobby ${result.lobby.code}`
        );
      }

      // Mantener la sesión por un tiempo para permitir reconexión
      setTimeout(() => {
        const currentSession = this.sessions.get(socket.id);
        if (currentSession && currentSession.playerId === session.playerId) {
          this.sessions.delete(socket.id);
        }
      }, 60000); // 1 minuto para reconectarse
    } catch (error) {
      console.error('Error manejando desconexión:', error);
    }
  }

  /**
   * Progresa el juego a la siguiente fase
   */
  private progressGamePhase(lobbyCode: string): void {
    try {
      const lobby = this.lobbyService.getLobby(lobbyCode);
      if (!lobby.gameState) return;

      const phase = lobby.gameState.phase;

      switch (phase) {
        case 'waiting':
        case 'results':
          // Iniciar nueva ronda
          this.startNextRound(lobbyCode);
          break;

        case 'writing':
          // Pasar a votación
          this.startVotingPhase(lobbyCode);
          break;

        case 'voting':
          // Mostrar resultados
          this.showRoundResults(lobbyCode);
          break;
      }
    } catch (error) {
      console.error('Error progresando fase del juego:', error);
    }
  }

  /**
   * Inicia una nueva ronda
   */
  private startNextRound(lobbyCode: string): void {
    try {
      const lobby = this.lobbyService.getLobby(lobbyCode);
      if (!lobby.gameState) return;

      // Si venimos de 'results', incrementar el número de ronda
      if (lobby.gameState.phase === 'results') {
        lobby.gameState.currentRound++;
      }

      // Verificar si el juego ha terminado
      if (this.gameService.isGameFinished(lobby)) {
        const result = this.gameService.finishGame(lobby);
        this.io.to(lobbyCode).emit('game_finished', result);
        return;
      }

      const round = this.gameService.startRound(
        lobby,
        lobby.gameState.currentRound
      );

      // Notificar inicio de ronda
      this.io.to(lobbyCode).emit('round_started', {
        round,
        gameState: lobby.gameState,
        timeRemaining: lobby.settings.answerTimeSeconds,
      } as any);

      this.io.to(lobbyCode).emit('writing_phase', {
        timeRemaining: 0, // Sin timer - control manual
      });
    } catch (error) {
      console.error('Error iniciando ronda:', error);
    }
  }

  /**
   * Inicia la fase de votación
   */
  private startVotingPhase(lobbyCode: string): void {
    try {
      const lobby = this.lobbyService.getLobby(lobbyCode);

      const options = this.gameService.prepareVotingOptions(lobby);

      // Notificar fase de votación
      this.io.to(lobbyCode).emit('voting_phase', {
        options,
        timeRemaining: 0, // Sin timer - control manual
      });
    } catch (error) {
      console.error('Error iniciando votación:', error);
    }
  }

  /**
   * Muestra los resultados de la ronda
   */
  private showRoundResults(lobbyCode: string): void {
    try {
      const lobby = this.lobbyService.getLobby(lobbyCode);

      const results = this.gameService.calculateRoundResults(lobby);
      const currentRound = this.gameService.getCurrentRound(lobby.gameState!);

      // Notificar resultados
      this.io.to(lobbyCode).emit('round_results', {
        results,
        options: currentRound?.options || [],
        votes: currentRound?.votes || {},
        nextRound:
          lobby.gameState!.currentRound < lobby.settings.maxRounds
            ? lobby.gameState!.currentRound + 1
            : undefined,
      });

      // Actualizar estado del juego
      this.io
        .to(lobbyCode)
        .emit('game_state_updated', { gameState: lobby.gameState! });
    } catch (error) {
      console.error('Error mostrando resultados:', error);
    }
  }

  /**
   * Configura un timer para una fase del juego
   */
  private setPhaseTimer(lobbyCode: string, durationMs: number): void {
    // Cancelar timer previo si existe
    const existingTimer = this.timers.get(lobbyCode);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Crear nuevo timer
    const timer = setTimeout(() => {
      this.progressGamePhase(lobbyCode);
      this.timers.delete(lobbyCode);
    }, durationMs);

    this.timers.set(lobbyCode, timer);
  }

  /**
   * Maneja errores y los envía al cliente
   */
  private handleError(socket: Socket, error: unknown): void {
    console.error('Socket error:', error);

    if (error instanceof LobbyError || error instanceof GameError) {
      socket.emit('error', {
        message: error.message,
        code: error.code,
      });
    } else if (error instanceof Error) {
      socket.emit('error', {
        message: error.message,
        code: 'UNKNOWN_ERROR',
      });
    } else {
      socket.emit('error', {
        message: 'Error desconocido',
        code: 'UNKNOWN_ERROR',
      });
    }
  }

  /**
   * Obtiene estadísticas del servidor
   */
  getStats() {
    return {
      ...this.lobbyService.getServerStats(),
      activeSessions: this.sessions.size,
      activeTimers: this.timers.size,
    };
  }

  /**
   * Limpia recursos (llamar al cerrar servidor)
   */
  cleanup(): void {
    // Limpiar todos los timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // Cerrar servidor
    this.io.close();
  }
}
