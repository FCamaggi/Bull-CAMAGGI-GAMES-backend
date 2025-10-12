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
    
    console.log('🎯 PlayerSelector inicializado:');
    console.log('📊 Estadísticas iniciales:', this.getStats());
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

    console.log('📊 Estadísticas después de selección:', this.getStats());

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

    // Log para debugging del algoritmo de selección
    console.log(`🎯 PlayerSelector - Selección para equipo ${team}:`);
    probabilities.forEach((prob, i) => {
      const participation = this.participationHistory.get(prob.player.id);
      console.log(`  ${i + 1}. ${prob.player.name}: ${(prob.probability * 100).toFixed(1)}% (jugó ${participation?.timesPlayed || 0} veces, factor: ${prob.factor})`);
    });

    // Selección por ruleta (weighted random selection)
    const random = Math.random();
    let accumulator = 0;

    console.log(`🎲 Random generado: ${(random * 100).toFixed(1)}%`);
    
    for (const prob of probabilities) {
      accumulator += prob.probability;
      if (random <= accumulator) {
        console.log(`✅ Seleccionado: ${prob.player.name} (acumulado: ${(accumulator * 100).toFixed(1)}%)`);
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
   * Sistema simplificado: jugadores que no han jugado tienen mayor peso
   */
  private calculatePlayerFactor(participation: PlayerParticipation): number {
    // Jugadores que nunca han jugado tienen peso completo (1.0)
    if (participation.lastRoundPlayed === -1) {
      return 1.0;
    }

    // Jugadores que ya jugaron tienen peso reducido (0.5)
    // Esto significa que si tienes 5 jugadores: 4 con peso 1.0 y 1 con peso 0.5
    // Las probabilidades serían: 1.0/(4*1.0 + 1*0.5) = 1.0/4.5 ≈ 22.2% vs 0.5/4.5 ≈ 11.1%
    return 0.5;
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
   * En el sistema simplificado, no necesitamos normalización compleja
   */
  private normalizeFactors(): void {
    // En el sistema simplificado, los factores ya están definidos correctamente
    // No necesitamos normalización adicional
  }

  /**
   * Obtiene estadísticas del selector (para debugging)
   */
  getStats(): any {
    const allParticipations = Array.from(this.participationHistory.values());
    const totalFactor = allParticipations.reduce((sum, p) => sum + p.factor, 0);
    
    const stats = Array.from(this.participationHistory.entries()).map(
      ([playerId, participation]) => ({
        playerId,
        timesPlayed: participation.timesPlayed,
        lastRoundPlayed: participation.lastRoundPlayed,
        factor: participation.factor,
        probability: totalFactor > 0 ? (participation.factor / totalFactor * 100).toFixed(1) + '%' : '0%',
      })
    );

    return {
      currentRound: this.currentRound,
      players: stats,
      totalPlayers: stats.length,
      averageTimesPlayed: this.getAverageTimesPlayed(),
      algorithm: 'simplified', // Indicador del algoritmo usado
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
