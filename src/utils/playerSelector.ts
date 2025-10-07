import type { Player } from '../types';

/**
 * Información de participación de un jugador
 */
interface PlayerParticipation {
  playerId: string;
  lastRoundPlayed: number; // -1 si nunca ha jugado
  timesPlayed: number;
  factor: number; // Factor de probabilidad (0-1)
}

/**
 * Algoritmo inteligente de selección de jugadores
 * Utiliza factores de probabilidad para evitar repeticiones
 */
export class PlayerSelector {
  private participationHistory: Map<string, PlayerParticipation> = new Map();
  private currentRound: number = 0;

  /**
   * Inicializa el selector con los jugadores del lobby
   */
  initialize(bluePlayers: Player[], redPlayers: Player[]): void {
    this.participationHistory.clear();
    this.currentRound = 0;

    // Inicializar historial para todos los jugadores
    [...bluePlayers, ...redPlayers].forEach((player) => {
      this.participationHistory.set(player.id, {
        playerId: player.id,
        lastRoundPlayed: -1,
        timesPlayed: 0,
        factor: 1.0, // Todos empiezan con probabilidad máxima
      });
    });

    this.updateFactors();
  }

  /**
   * Selecciona un jugador de cada equipo para la ronda actual
   */
  selectPlayersForRound(
    bluePlayers: Player[],
    redPlayers: Player[],
    hostId?: string
  ): {
    bluePlayer: Player;
    redPlayer: Player;
  } {
    this.currentRound++;

    console.log(
      '🎯 PlayerSelector - Seleccionando para ronda',
      this.currentRound
    );
    console.log(
      '🔵 Jugadores azules recibidos:',
      bluePlayers.map((p) => ({ name: p.name, id: p.id }))
    );
    console.log(
      '🔴 Jugadores rojos recibidos:',
      redPlayers.map((p) => ({ name: p.name, id: p.id }))
    );
    console.log('👑 Host ID:', hostId);

    // Filtrar jugadores para excluir al host
    const eligibleBluePlayers = hostId
      ? bluePlayers.filter((p) => p.id !== hostId)
      : bluePlayers;
    const eligibleRedPlayers = hostId
      ? redPlayers.filter((p) => p.id !== hostId)
      : redPlayers;

    console.log(
      '✅ Jugadores azules elegibles:',
      eligibleBluePlayers.map((p) => ({ name: p.name, id: p.id }))
    );
    console.log(
      '✅ Jugadores rojos elegibles:',
      eligibleRedPlayers.map((p) => ({ name: p.name, id: p.id }))
    );

    // Verificar que tengamos jugadores elegibles
    if (eligibleBluePlayers.length === 0) {
      throw new Error(
        'No hay jugadores elegibles en el equipo azul (excluyendo host)'
      );
    }
    if (eligibleRedPlayers.length === 0) {
      throw new Error(
        'No hay jugadores elegibles en el equipo rojo (excluyendo host)'
      );
    }

    const bluePlayer = this.selectPlayerFromTeam(eligibleBluePlayers, 'blue');
    const redPlayer = this.selectPlayerFromTeam(eligibleRedPlayers, 'red');

    console.log('🎭 Jugadores seleccionados:');
    console.log('  🔵 Azul:', { name: bluePlayer.name, id: bluePlayer.id });
    console.log('  🔴 Rojo:', { name: redPlayer.name, id: redPlayer.id });

    // Actualizar historial
    this.updatePlayerParticipation(bluePlayer.id);
    this.updatePlayerParticipation(redPlayer.id);

    // Recalcular factores después de la selección
    this.updateFactors();

    return { bluePlayer, redPlayer };
  }

  /**
   * Selecciona un jugador de un equipo específico basado en factores de probabilidad
   */
  private selectPlayerFromTeam(
    players: Player[],
    team: 'blue' | 'red'
  ): Player {
    if (players.length === 0) {
      throw new Error(`No hay jugadores en el equipo ${team}`);
    }

    if (players.length === 1) {
      return players[0];
    }

    // Obtener factores de probabilidad para los jugadores del equipo
    const playerFactors = players.map((player) => {
      const participation = this.participationHistory.get(player.id);
      return {
        player,
        factor: participation?.factor || 1.0,
      };
    });

    // Calcular probabilidades normalizadas
    const totalFactor = playerFactors.reduce((sum, pf) => sum + pf.factor, 0);
    const probabilities = playerFactors.map((pf) => ({
      ...pf,
      probability: pf.factor / totalFactor,
    }));

    // Selección por ruleta (weighted random selection)
    const random = Math.random();
    let accumulator = 0;

    for (const prob of probabilities) {
      accumulator += prob.probability;
      if (random <= accumulator) {
        return prob.player;
      }
    }

    // Fallback: devolver el último jugador (no debería llegar aquí)
    return probabilities[probabilities.length - 1].player;
  }

  /**
   * Actualiza la participación de un jugador después de ser seleccionado
   */
  private updatePlayerParticipation(playerId: string): void {
    const participation = this.participationHistory.get(playerId);
    if (participation) {
      participation.lastRoundPlayed = this.currentRound;
      participation.timesPlayed++;
    }
  }

  /**
   * Recalcula los factores de probabilidad para todos los jugadores
   */
  private updateFactors(): void {
    const allParticipations = Array.from(this.participationHistory.values());

    // Si no hay historial aún, todos tienen factor 1.0
    if (this.currentRound === 0) {
      allParticipations.forEach((p) => (p.factor = 1.0));
      return;
    }

    allParticipations.forEach((participation) => {
      participation.factor = this.calculatePlayerFactor(participation);
    });

    // Normalizar factores para que la suma sea razonable
    this.normalizeFactors();
  }

  /**
   * Calcula el factor de probabilidad individual de un jugador
   */
  private calculatePlayerFactor(participation: PlayerParticipation): number {
    // Factor base: jugadores que nunca han jugado tienen prioridad máxima
    if (participation.lastRoundPlayed === -1) {
      return 2.0; // Doble probabilidad para jugadores nuevos
    }

    // Factor por recencia: cuánto tiempo hace que no juega
    const roundsSinceLastPlay =
      this.currentRound - participation.lastRoundPlayed;
    const recencyFactor = Math.min(2.0, 1.0 + roundsSinceLastPlay * 0.2);

    // Factor por frecuencia: penalizar jugadores que han jugado mucho
    const avgTimesPlayed = this.getAverageTimesPlayed();
    const frequencyRatio =
      participation.timesPlayed / Math.max(avgTimesPlayed, 1);
    const frequencyFactor = Math.max(0.1, 1.0 - (frequencyRatio - 1) * 0.3);

    // Combinar factores
    return recencyFactor * frequencyFactor;
  }

  /**
   * Obtiene el promedio de veces que han jugado todos los jugadores
   */
  private getAverageTimesPlayed(): number {
    const allParticipations = Array.from(this.participationHistory.values());
    const totalTimes = allParticipations.reduce(
      (sum, p) => sum + p.timesPlayed,
      0
    );
    return totalTimes / allParticipations.length;
  }

  /**
   * Normaliza los factores para mantener proporciones adecuadas
   */
  private normalizeFactors(): void {
    const allParticipations = Array.from(this.participationHistory.values());
    const totalFactor = allParticipations.reduce((sum, p) => sum + p.factor, 0);

    if (totalFactor > 0) {
      const normalizer = allParticipations.length / totalFactor;
      allParticipations.forEach((p) => {
        p.factor = Math.max(0.1, p.factor * normalizer); // Mínimo 10%
      });
    }
  }

  /**
   * Obtiene estadísticas del selector (para debugging)
   */
  getStats(): any {
    const stats = Array.from(this.participationHistory.entries()).map(
      ([playerId, participation]) => ({
        playerId,
        timesPlayed: participation.timesPlayed,
        lastRoundPlayed: participation.lastRoundPlayed,
        factor: participation.factor,
        probability: participation.factor,
      })
    );

    return {
      currentRound: this.currentRound,
      players: stats,
      totalPlayers: stats.length,
      averageTimesPlayed: this.getAverageTimesPlayed(),
    };
  }

  /**
   * Reinicia el selector para un nuevo juego
   */
  reset(): void {
    this.participationHistory.clear();
    this.currentRound = 0;
  }
}
