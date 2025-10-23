import { Lobby, Player, Team, GameSettings, LobbyStatus } from '../types';
import {
  generateUniqueLobbyCode,
  normalizeLobbyCode,
  isValidLobbyCode,
} from '../utils/codeGenerator';
import { generateUUID, isOlderThan } from '../utils/helpers';
import {
  DEFAULT_GAME_SETTINGS,
  MAX_PLAYERS_PER_LOBBY,
  MAX_ACTIVE_PLAYERS_PER_TEAM,
  MAX_SPECTATORS_PER_TEAM,
  MIN_PLAYERS_TO_START,
  LOBBY_EXPIRY_HOURS,
  ERROR_CODES,
} from '../utils/constants';

/**
 * Errores personalizados para el servicio de lobby
 */
export class LobbyError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'LobbyError';
  }
}

/**
 * Servicio para gestionar lobbies en memoria
 */
export class LobbyService {
  private lobbies = new Map<string, Lobby>();

  /**
   * Crea un nuevo lobby con el jugador como host
   */
  createLobby(
    hostName: string,
    socketId: string
  ): { lobby: Lobby; playerId: string } {
    // Verificar límite de lobbies
    if (this.lobbies.size >= 100) {
      // MAX_LOBBIES desde constants
      throw new LobbyError(
        'El servidor está lleno. Intenta más tarde.',
        ERROR_CODES.SERVER_FULL,
        503
      );
    }

    const lobbyCode = generateUniqueLobbyCode(new Set(this.lobbies.keys()));

    console.log('🔍 Debug createLobby:', {
      generatedCode: lobbyCode,
      length: lobbyCode.length,
      chars: lobbyCode.split(''),
      isValid: isValidLobbyCode(lobbyCode),
    });

    const hostId = generateUUID();

    // El host NO es un jugador, solo controla el lobby
    const lobby: Lobby = {
      code: lobbyCode,
      hostId,
      hostSocketId: socketId,
      players: [], // Host no está en la lista de jugadores
      teams: { blue: [], red: [] },
      status: 'waiting',
      createdAt: new Date(),
      lastActivity: new Date(),
      settings: { ...DEFAULT_GAME_SETTINGS },
    };

    this.lobbies.set(lobbyCode, lobby);

    console.log(`Lobby creado: ${lobbyCode} por ${hostName} (${hostId})`);

    return { lobby, playerId: hostId };
  }

  /**
   * Un jugador se une a un lobby existente
   */
  joinLobby(
    code: string,
    playerName: string,
    socketId: string
  ): { lobby: Lobby; playerId: string } {
    const normalizedCode = normalizeLobbyCode(code);

    console.log('🔍 Debug joinLobby:', {
      original: code,
      normalized: normalizedCode,
      length: normalizedCode.length,
      chars: normalizedCode.split(''),
      existingLobbies: Array.from(this.lobbies.keys()),
    });

    if (!isValidLobbyCode(normalizedCode)) {
      console.error('❌ Código inválido:', normalizedCode);
      throw new LobbyError(
        'Código de lobby inválido',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const lobby = this.lobbies.get(normalizedCode);
    if (!lobby) {
      throw new LobbyError(
        'Lobby no encontrado',
        ERROR_CODES.LOBBY_NOT_FOUND,
        404
      );
    }

    if (lobby.status !== 'waiting') {
      throw new LobbyError(
        'El juego ya ha comenzado',
        ERROR_CODES.GAME_ALREADY_STARTED
      );
    }

    if (lobby.players.length >= MAX_PLAYERS_PER_LOBBY) {
      throw new LobbyError('El lobby está lleno', ERROR_CODES.LOBBY_FULL);
    }

    // Verificar nombre único
    const existingNames = lobby.players.map((p) => p.name.toLowerCase());
    if (existingNames.includes(playerName.toLowerCase())) {
      throw new LobbyError(
        'Ya hay un jugador con ese nombre',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const playerId = generateUUID();
    const newPlayer: Player = {
      id: playerId,
      name: playerName,
      isHost: false,
      socketId,
      score: 0,
      isReady: false,
      isConnected: true,
      role: 'spectator', // Por defecto espectador, se asigna 'active' al seleccionar equipo
    };

    lobby.players.push(newPlayer);
    lobby.lastActivity = new Date();

    console.log(
      `Jugador ${playerName} (${playerId}) se unió al lobby ${normalizedCode}`
    );

    return { lobby, playerId };
  }

  /**
   * Un jugador abandona el lobby
   */
  leaveLobby(
    code: string,
    playerId: string
  ): { lobby: Lobby | null; wasHost: boolean } {
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      return { lobby: null, wasHost: false };
    }

    const playerIndex = lobby.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) {
      return { lobby, wasHost: false };
    }

    const leavingPlayer = lobby.players[playerIndex]!;
    const wasHost = leavingPlayer.isHost;

    // Remover jugador de su equipo si tiene uno
    if (leavingPlayer.team) {
      lobby.teams[leavingPlayer.team] = lobby.teams[leavingPlayer.team].filter(
        (p) => p.id !== playerId
      );
    }

    // Remover jugador de la lista
    lobby.players.splice(playerIndex, 1);
    lobby.lastActivity = new Date();

    console.log(
      `Jugador ${leavingPlayer.name} (${playerId}) abandonó el lobby ${code}`
    );

    // Si era el host y quedan jugadores, promover al siguiente
    if (wasHost && lobby.players.length > 0) {
      const newHost = lobby.players[0]!;
      newHost.isHost = true;
      lobby.hostId = newHost.id;
      console.log(`Nuevo host: ${newHost.name} (${newHost.id})`);
    }

    // Si no quedan jugadores, eliminar lobby
    if (lobby.players.length === 0) {
      this.lobbies.delete(code);
      console.log(`Lobby ${code} eliminado (sin jugadores)`);
      return { lobby: null, wasHost };
    }

    return { lobby, wasHost };
  }

  /**
   * Un jugador selecciona su equipo y rol
   */
  selectTeam(code: string, playerId: string, team: Team, preferredRole?: 'active' | 'spectator'): Lobby {
    const lobby = this.getLobby(code);
    const player = this.getPlayer(lobby, playerId);

    if (lobby.status !== 'waiting') {
      throw new LobbyError(
        'No se puede cambiar de equipo después de que el juego haya comenzado',
        ERROR_CODES.GAME_ALREADY_STARTED
      );
    }

    // Contar jugadores actuales en el equipo objetivo
    const activePlayersInTeam = lobby.teams[team].filter(
      (p) => p.role === 'active'
    ).length;
    const spectatorPlayersInTeam = lobby.teams[team].filter(
      (p) => p.role === 'spectator'
    ).length;

    // Determinar el rol que tendrá el jugador
    let assignedRole: 'active' | 'spectator';
    
    // Si el usuario especificó un rol preferido, intentar asignarlo
    if (preferredRole === 'spectator') {
      // Usuario quiere ser espectador explícitamente
      if (spectatorPlayersInTeam >= MAX_SPECTATORS_PER_TEAM) {
        throw new LobbyError(
          `El equipo ${team} ya tiene el máximo de espectadores (${MAX_SPECTATORS_PER_TEAM})`,
          ERROR_CODES.TEAM_FULL
        );
      }
      assignedRole = 'spectator';
    } else if (preferredRole === 'active') {
      // Usuario quiere ser activo explícitamente
      if (activePlayersInTeam >= MAX_ACTIVE_PLAYERS_PER_TEAM) {
        throw new LobbyError(
          `El equipo ${team} ya tiene el máximo de jugadores activos (${MAX_ACTIVE_PLAYERS_PER_TEAM})`,
          ERROR_CODES.TEAM_FULL
        );
      }
      assignedRole = 'active';
    } else {
      // Sin preferencia: asignar automáticamente
      if (activePlayersInTeam < MAX_ACTIVE_PLAYERS_PER_TEAM) {
        assignedRole = 'active';
      } else if (spectatorPlayersInTeam < MAX_SPECTATORS_PER_TEAM) {
        assignedRole = 'spectator';
      } else {
        throw new LobbyError(
          `El equipo ${team} está lleno (${MAX_ACTIVE_PLAYERS_PER_TEAM} activos + ${MAX_SPECTATORS_PER_TEAM} espectadores)`,
          ERROR_CODES.TEAM_FULL
        );
      }
    }

    // Remover del equipo anterior si tenía uno
    if (player.team) {
      lobby.teams[player.team] = lobby.teams[player.team].filter(
        (p) => p.id !== playerId
      );
    }

    // Asignar nuevo rol y equipo
    player.role = assignedRole;
    player.team = team;
    
    // Si cambia de activo a espectador (o viceversa), resetear ready
    if (assignedRole === 'spectator') {
      player.isReady = false; // Espectadores no marcan ready
    }
    
    lobby.teams[team].push(player);
    lobby.lastActivity = new Date();

    console.log(
      `Jugador ${player.name} seleccionó equipo ${team} en lobby ${code} como ${assignedRole} (preferencia: ${preferredRole || 'auto'}, ${activePlayersInTeam} activos, ${spectatorPlayersInTeam} espectadores actuales)`
    );

    return lobby;
  }

  /**
   * Toggle del estado ready de un jugador
   * Solo jugadores activos pueden marcar ready
   */
  toggleReady(code: string, playerId: string): Lobby {
    const lobby = this.getLobby(code);
    const player = this.getPlayer(lobby, playerId);

    if (lobby.status !== 'waiting') {
      throw new LobbyError(
        'No se puede cambiar el estado ready después de que el juego haya comenzado',
        ERROR_CODES.GAME_ALREADY_STARTED
      );
    }

    // Solo jugadores activos pueden marcar ready
    if (player.role !== 'active') {
      throw new LobbyError(
        'Solo los jugadores activos pueden marcar ready',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    player.isReady = !player.isReady;
    lobby.lastActivity = new Date();

    console.log(
      `Jugador ${player.name} cambió ready a ${player.isReady} en lobby ${code}`
    );

    return lobby;
  }

  /**
   * Actualiza la configuración del juego (solo host)
   */
  updateGameSettings(
    code: string,
    hostId: string,
    settings: Partial<GameSettings>
  ): Lobby {
    const lobby = this.getLobby(code);

    if (lobby.hostId !== hostId) {
      throw new LobbyError(
        'Solo el host puede cambiar la configuración',
        ERROR_CODES.NOT_HOST,
        403
      );
    }

    if (lobby.status !== 'waiting') {
      throw new LobbyError(
        'No se puede cambiar la configuración después de que el juego haya comenzado',
        ERROR_CODES.GAME_ALREADY_STARTED
      );
    }

    lobby.settings = { ...lobby.settings, ...settings };
    lobby.lastActivity = new Date();

    console.log(`Configuración actualizada en lobby ${code}:`, settings);

    return lobby;
  }

  /**
   * Verifica si un lobby puede iniciar el juego
   */
  canStartGame(code: string): { canStart: boolean; reason?: string } {
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      return { canStart: false, reason: 'Lobby no encontrado' };
    }

    if (lobby.status !== 'waiting') {
      return { canStart: false, reason: 'El juego ya ha comenzado' };
    }

    if (lobby.players.length < MIN_PLAYERS_TO_START) {
      return {
        canStart: false,
        reason: `Se necesitan al menos ${MIN_PLAYERS_TO_START} jugadores`,
      };
    }

    // Verificar que ambos equipos tengan al menos 1 jugador activo
    const activeBlue = lobby.teams.blue.filter((p) => p.role === 'active');
    const activeRed = lobby.teams.red.filter((p) => p.role === 'active');

    if (activeBlue.length === 0 || activeRed.length === 0) {
      return {
        canStart: false,
        reason: 'Ambos equipos deben tener al menos un jugador activo',
      };
    }

    // Verificar que todos los jugadores ACTIVOS estén listos
    // Los espectadores pueden unirse en cualquier momento sin bloquear el inicio
    const activePlayers = lobby.players.filter((p) => p.role === 'active');
    const notReadyActivePlayers = activePlayers.filter((p) => !p.isReady);

    if (notReadyActivePlayers.length > 0) {
      return {
        canStart: false,
        reason: `Esperando jugadores activos: ${notReadyActivePlayers
          .map((p) => p.name)
          .join(', ')}`,
      };
    }

    return { canStart: true };
  }

  /**
   * Actualiza el estado del socket de un jugador
   */
  updatePlayerSocket(code: string, playerId: string, socketId: string): void {
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    const player = lobby.players.find((p) => p.id === playerId);
    if (player) {
      player.socketId = socketId;
      player.isConnected = true;
      lobby.lastActivity = new Date();
    }
  }

  /**
   * Marca un jugador como desconectado
   */
  markPlayerDisconnected(
    socketId: string
  ): { lobby: Lobby; player: Player } | null {
    for (const lobby of this.lobbies.values()) {
      const player = lobby.players.find((p) => p.socketId === socketId);
      if (player) {
        player.isConnected = false;
        lobby.lastActivity = new Date();
        return { lobby, player };
      }
    }
    return null;
  }

  /**
   * Obtiene un lobby por código
   */
  getLobby(code: string): Lobby {
    const lobby = this.lobbies.get(code);
    if (!lobby) {
      throw new LobbyError(
        'Lobby no encontrado',
        ERROR_CODES.LOBBY_NOT_FOUND,
        404
      );
    }
    return lobby;
  }

  /**
   * Obtiene un jugador en un lobby
   */
  getPlayer(lobby: Lobby, playerId: string): Player {
    const player = lobby.players.find((p) => p.id === playerId);
    if (!player) {
      throw new LobbyError(
        'Jugador no encontrado',
        ERROR_CODES.PLAYER_NOT_FOUND,
        404
      );
    }
    return player;
  }

  /**
   * Obtiene estadísticas del servidor
   */
  getServerStats() {
    return {
      activeLobbies: this.lobbies.size,
      totalPlayers: Array.from(this.lobbies.values()).reduce(
        (total, lobby) => total + lobby.players.length,
        0
      ),
      gamesInProgress: Array.from(this.lobbies.values()).filter(
        (l) => l.status === 'playing'
      ).length,
    };
  }

  /**
   * Limpia lobbies antiguos sin actividad
   */
  cleanupInactiveLobbies(): number {
    let cleaned = 0;

    for (const [code, lobby] of this.lobbies.entries()) {
      if (isOlderThan(lobby.lastActivity, LOBBY_EXPIRY_HOURS)) {
        this.lobbies.delete(code);
        cleaned++;
        console.log(`Lobby ${code} limpiado por inactividad`);
      }
    }

    if (cleaned > 0) {
      console.log(`Se limpiaron ${cleaned} lobbies inactivos`);
    }

    return cleaned;
  }

  /**
   * Obtiene todos los lobbies (para debugging)
   */
  getAllLobbies(): Lobby[] {
    return Array.from(this.lobbies.values());
  }
}
