import {
  BullGameState,
  BullRound,
  RoundOption,
  RoundResult,
  Lobby,
  Player,
  GamePhase,
  RoundStatus,
  Team,
  OptionOrigin,
} from '../types';
import { generateUUID, shuffleArray } from '../utils/helpers';
import { ERROR_CODES, ROUND_OPTIONS_COUNT } from '../utils/constants';
import { PlayerSelector } from '../utils/playerSelector';

/**
 * Preguntas predefinidas para el juego Bull
 */
const SAMPLE_QUESTIONS = [
  {
    question: '¿Cuál es la capital de Francia?',
    correctAnswer: 'París',
    incorrectAnswer: 'Londres',
  },
  {
    question: '¿En qué año se fundó Facebook?',
    correctAnswer: '2004',
    incorrectAnswer: '2006',
  },
  {
    question: '¿Cuál es el océano más grande del mundo?',
    correctAnswer: 'Océano Pacífico',
    incorrectAnswer: 'Océano Atlántico',
  },
  {
    question: "¿Quién escribió 'Don Quijote de la Mancha'?",
    correctAnswer: 'Miguel de Cervantes',
    incorrectAnswer: 'Federico García Lorca',
  },
  {
    question: '¿Cuál es el planeta más cercano al Sol?',
    correctAnswer: 'Mercurio',
    incorrectAnswer: 'Venus',
  },
  {
    question: '¿En qué año terminó la Segunda Guerra Mundial?',
    correctAnswer: '1945',
    incorrectAnswer: '1944',
  },
  {
    question: '¿Cuál es el río más largo del mundo?',
    correctAnswer: 'Río Nilo',
    incorrectAnswer: 'Río Amazonas',
  },
  {
    question: "¿Quién pintó 'La Mona Lisa'?",
    correctAnswer: 'Leonardo da Vinci',
    incorrectAnswer: 'Pablo Picasso',
  },
  {
    question: '¿Cuál es el elemento químico más abundante en el universo?',
    correctAnswer: 'Hidrógeno',
    incorrectAnswer: 'Oxígeno',
  },
  {
    question: '¿En qué ciudad se encuentran las Torres Petronas?',
    correctAnswer: 'Kuala Lumpur',
    incorrectAnswer: 'Singapur',
  },
];

/**
 * Error personalizado para el servicio de juego
 */
export class GameError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'GameError';
  }
}

/**
 * Servicio para manejar la lógica del juego Bull
 */
export class GameService {
  private playerSelector = new PlayerSelector();
  /**
   * Inicia un nuevo juego en el lobby
   */
  startGame(lobby: Lobby): BullGameState {
    if (lobby.status !== 'waiting') {
      throw new GameError(
        'El juego ya ha comenzado',
        ERROR_CODES.GAME_ALREADY_STARTED
      );
    }

    // Verificar que ambos equipos tengan jugadores
    if (lobby.teams.blue.length === 0 || lobby.teams.red.length === 0) {
      throw new GameError(
        'Ambos equipos deben tener al menos un jugador',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const gameState: BullGameState = {
      currentRound: 1,
      totalRounds: lobby.settings.maxRounds,
      phase: 'waiting',
      rounds: [],
      scores: { blue: 0, red: 0 },
    };

    // Inicializar el selector de jugadores
    this.playerSelector.initialize(lobby.teams.blue, lobby.teams.red);

    lobby.gameState = gameState;
    lobby.status = 'playing';

    return gameState;
  }

  /**
   * Inicia una nueva ronda
   */
  startRound(lobby: Lobby, roundNumber: number): BullRound {
    if (!lobby.gameState) {
      throw new GameError(
        'El juego no ha sido iniciado',
        ERROR_CODES.INVALID_PHASE
      );
    }

    if (roundNumber > lobby.settings.maxRounds) {
      throw new GameError(
        'Número de ronda inválido',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Seleccionar pregunta que no haya sido usada
    const usedQuestions = lobby.gameState.rounds.map((r) => r.question);
    const availableQuestions = SAMPLE_QUESTIONS.filter(
      (q) => !usedQuestions.includes(q.question)
    );

    // Si no hay preguntas disponibles, reiniciar el pool
    const questionPool =
      availableQuestions.length > 0 ? availableQuestions : SAMPLE_QUESTIONS;

    const questionData =
      questionPool[Math.floor(Math.random() * questionPool.length)]!;

    // Seleccionar jugadores para esta ronda (excluyendo al host)
    const hostId = lobby.hostId;
    const { bluePlayer, redPlayer } = this.playerSelector.selectPlayersForRound(
      lobby.teams.blue,
      lobby.teams.red,
      hostId
    );

    console.log('🎮 GameService - Ronda creada con jugadores seleccionados:');
    console.log('  🔵 Azul:', { name: bluePlayer.name, id: bluePlayer.id });
    console.log('  🔴 Rojo:', { name: redPlayer.name, id: redPlayer.id });

    const round: BullRound = {
      number: roundNumber,
      question: questionData.question,
      correctAnswer: questionData.correctAnswer,
      incorrectAnswer: questionData.incorrectAnswer,
      selectedPlayers: {
        blue: bluePlayer,
        red: redPlayer,
      },
      playerAnswers: {},
      playersReady: {},
      options: [],
      votes: {},
      status: 'answering',
      pointsAwarded: {},
      startedAt: new Date(),
    };

    lobby.gameState.rounds.push(round);
    lobby.gameState.currentRound = roundNumber;
    lobby.gameState.phase = 'writing';

    return round;
  }

  /**
   * Un jugador envía su respuesta falsa
   */
  submitAnswer(lobby: Lobby, playerId: string, answer: string): void {
    if (!lobby.gameState) {
      throw new GameError(
        'El juego no ha sido iniciado',
        ERROR_CODES.INVALID_PHASE
      );
    }

    if (lobby.gameState.phase !== 'writing') {
      throw new GameError(
        'No es momento de escribir respuestas',
        ERROR_CODES.INVALID_PHASE
      );
    }

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) {
      throw new GameError('No hay ronda activa', ERROR_CODES.INVALID_PHASE);
    }

    // Verificar que el jugador no haya enviado ya una respuesta
    if (currentRound.playerAnswers[playerId]) {
      throw new GameError(
        'Ya has enviado tu respuesta',
        ERROR_CODES.ALREADY_SUBMITTED
      );
    }

    // Validar que el jugador esté seleccionado para esta ronda
    const isSelectedPlayer =
      currentRound.selectedPlayers.blue.id === playerId ||
      currentRound.selectedPlayers.red.id === playerId;

    if (!isSelectedPlayer) {
      throw new GameError(
        'Solo los jugadores seleccionados pueden responder en esta ronda',
        ERROR_CODES.INVALID_PHASE
      );
    }

    currentRound.playerAnswers[playerId] = answer.trim();
  }

  /**
   * Marca a un jugador como listo después de enviar respuesta
   */
  markPlayerReady(lobby: Lobby, playerId: string): void {
    if (!lobby.gameState) {
      throw new GameError(
        'El juego no ha sido iniciado',
        ERROR_CODES.INVALID_PHASE
      );
    }

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) {
      throw new GameError('No hay ronda activa', ERROR_CODES.INVALID_PHASE);
    }

    // Solo los jugadores seleccionados pueden marcar listo después de responder
    const isSelectedPlayer =
      currentRound.selectedPlayers.blue.id === playerId ||
      currentRound.selectedPlayers.red.id === playerId;

    if (!isSelectedPlayer) {
      throw new GameError(
        'Solo los jugadores seleccionados pueden marcar listo',
        ERROR_CODES.INVALID_PHASE
      );
    }

    // Verificar que el jugador haya enviado respuesta
    if (!currentRound.playerAnswers[playerId]) {
      throw new GameError(
        'Debes enviar una respuesta antes de marcar listo',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    currentRound.playersReady[playerId] = true;
  }

  /**
   * Verifica si todos los jugadores seleccionados están listos
   */
  allPlayersReady(lobby: Lobby): boolean {
    if (!lobby.gameState) return false;

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) return false;

    // Los 2 jugadores seleccionados deben estar listos
    const blueReady =
      currentRound.playersReady[currentRound.selectedPlayers.blue.id] || false;
    const redReady =
      currentRound.playersReady[currentRound.selectedPlayers.red.id] || false;

    return blueReady && redReady;
  }

  /**
   * Verifica si todos los jugadores seleccionados han enviado sus respuestas
   */
  allAnswersSubmitted(lobby: Lobby): boolean {
    if (!lobby.gameState) return false;

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) return false;

    // Solo los 2 jugadores seleccionados deben responder
    const expectedAnswers = 2;
    const submittedCount = Object.keys(currentRound.playerAnswers).length;

    return submittedCount >= expectedAnswers;
  }

  /**
   * Prepara las opciones para la fase de votación
   */
  prepareVotingOptions(lobby: Lobby): RoundOption[] {
    if (!lobby.gameState) {
      throw new GameError(
        'El juego no ha sido iniciado',
        ERROR_CODES.INVALID_PHASE
      );
    }

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) {
      throw new GameError('No hay ronda activa', ERROR_CODES.INVALID_PHASE);
    }

    const options: RoundOption[] = [];

    // Añadir respuesta correcta
    options.push({
      id: generateUUID(),
      text: currentRound.correctAnswer,
      origin: { type: 'correct' },
      position: 0,
    });

    // Añadir respuesta incorrecta
    options.push({
      id: generateUUID(),
      text: currentRound.incorrectAnswer,
      origin: { type: 'incorrect' },
      position: 0,
    });

    // Añadir respuestas de jugadores
    for (const [playerId, answer] of Object.entries(
      currentRound.playerAnswers
    )) {
      options.push({
        id: generateUUID(),
        text: answer,
        origin: { type: 'player', playerId },
        position: 0,
      });
    }

    // Completar con respuestas dummy si faltan
    while (options.length < ROUND_OPTIONS_COUNT) {
      const dummyAnswers = [
        'Respuesta placeholder 1',
        'Respuesta placeholder 2',
        'Respuesta placeholder 3',
      ];

      options.push({
        id: generateUUID(),
        text: dummyAnswers[options.length - 2] || 'Respuesta placeholder',
        origin: { type: 'incorrect' },
        position: 0,
      });
    }

    // Tomar solo las primeras 4 opciones y mezclarlas
    const finalOptions = shuffleArray(options.slice(0, ROUND_OPTIONS_COUNT));

    // Asignar posiciones
    finalOptions.forEach((option, index) => {
      option.position = index + 1;
    });

    currentRound.options = finalOptions;
    lobby.gameState.phase = 'voting';

    return finalOptions;
  }

  /**
   * Un jugador vota por una opción
   */
  submitVote(lobby: Lobby, playerId: string, optionId: string): void {
    if (!lobby.gameState) {
      throw new GameError(
        'El juego no ha sido iniciado',
        ERROR_CODES.INVALID_PHASE
      );
    }

    if (lobby.gameState.phase !== 'voting') {
      throw new GameError('No es momento de votar', ERROR_CODES.INVALID_PHASE);
    }

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) {
      throw new GameError('No hay ronda activa', ERROR_CODES.INVALID_PHASE);
    }

    // Todos los jugadores pueden votar (incluyendo los que respondieron)

    // Verificar que la opción existe
    const option = currentRound.options.find((o) => o.id === optionId);
    if (!option) {
      throw new GameError(
        'Opción de voto inválida',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Verificar que el jugador no haya votado ya
    if (currentRound.votes[playerId]) {
      throw new GameError('Ya has votado', ERROR_CODES.ALREADY_SUBMITTED);
    }

    currentRound.votes[playerId] = optionId;
  }

  /**
   * Verifica si todos los jugadores elegibles han votado
   */
  allVotesSubmitted(lobby: Lobby): boolean {
    if (!lobby.gameState) return false;

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) return false;

    // TODOS los jugadores conectados pueden votar (nueva mecánica)
    const connectedPlayers = lobby.players.filter((p) => p.isConnected);
    const eligibleVoters = connectedPlayers; // Todos votan ahora

    const votedCount = Object.keys(currentRound.votes).length;

    console.log('🗳️ Estado de votación:', {
      jugadoresConectados: connectedPlayers.length,
      votantes: eligibleVoters.length,
      votosRecibidos: votedCount,
      todosVotaron: votedCount >= eligibleVoters.length,
    });

    return votedCount >= eligibleVoters.length;
  }

  /**
   * Calcula los resultados de la ronda
   */
  calculateRoundResults(lobby: Lobby): RoundResult {
    if (!lobby.gameState) {
      throw new GameError(
        'El juego no ha sido iniciado',
        ERROR_CODES.INVALID_PHASE
      );
    }

    const currentRound = this.getCurrentRound(lobby.gameState);
    if (!currentRound) {
      throw new GameError('No hay ronda activa', ERROR_CODES.INVALID_PHASE);
    }

    const correctOption = currentRound.options.find(
      (o) => o.origin.type === 'correct'
    );
    if (!correctOption) {
      throw new GameError(
        'No se encontró la respuesta correcta',
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const result: RoundResult = {
      roundNumber: currentRound.number,
      question: currentRound.question,
      correctOptionId: correctOption.id,
      votes: {},
      pointsAwarded: {},
      newScores: { ...lobby.gameState.scores },
      confusionResults: {},
    };

    // Procesar cada voto
    for (const [playerId, optionId] of Object.entries(currentRound.votes)) {
      const player = lobby.players.find((p) => p.id === playerId);
      if (!player) continue;

      const votedOption = currentRound.options.find((o) => o.id === optionId);
      if (!votedOption) continue;

      const isCorrect = optionId === correctOption.id;
      let pointsEarned = 0;

      // Puntos por respuesta correcta
      if (isCorrect) {
        pointsEarned += lobby.settings.pointsCorrectAnswer;
      }

      result.votes[playerId] = { optionId, isCorrect };
      result.pointsAwarded[playerId] = pointsEarned;
      currentRound.pointsAwarded[playerId] = pointsEarned;

      // Actualizar score del jugador y equipo
      player.score += pointsEarned;
      if (player.team) {
        result.newScores[player.team] += pointsEarned;
      }
    }

    // Calcular puntos por confundir oponentes
    for (const option of currentRound.options) {
      if (option.origin.type === 'player') {
        const authorId = option.origin.playerId;
        const author = lobby.players.find((p) => p.id === authorId);
        if (!author) continue;

        // Contar cuántos del equipo contrario votaron por esta respuesta falsa
        const votersForThisOption = Object.entries(currentRound.votes)
          .filter(([, votedOptionId]) => votedOptionId === option.id)
          .map(([voterId]) => voterId)
          .filter((voterId) => {
            if (voterId === authorId) return false; // El autor no puede votar por su propia respuesta
            const voter = lobby.players.find((p) => p.id === voterId);
            // Solo contar si el votante es del equipo contrario
            return voter && voter.team && voter.team !== author.team;
          });

        if (votersForThisOption.length > 0) {
          const confusionPoints =
            votersForThisOption.length * lobby.settings.pointsConfuseOpponent;

          console.log(
            `💰 ${author.name} (${author.team}) ganó ${confusionPoints} puntos por confundir a ${votersForThisOption.length} oponentes con "${option.text}"`
          );

          // Añadir puntos al autor
          result.pointsAwarded[authorId] =
            (result.pointsAwarded[authorId] || 0) + confusionPoints;
          currentRound.pointsAwarded[authorId] =
            (currentRound.pointsAwarded[authorId] || 0) + confusionPoints;
          author.score += confusionPoints;

          if (author.team) {
            result.newScores[author.team] += confusionPoints;
          }

          result.confusionResults[authorId] = votersForThisOption;
        }
      }
    }

    // Actualizar scores del juego
    lobby.gameState.scores = result.newScores;
    currentRound.status = 'finished';
    currentRound.finishedAt = new Date();
    lobby.gameState.phase = 'results';

    return result;
  }

  /**
   * Verifica si el juego ha terminado
   */
  isGameFinished(lobby: Lobby): boolean {
    if (!lobby.gameState) return false;
    return lobby.gameState.currentRound >= lobby.settings.maxRounds;
  }

  /**
   * Finaliza el juego y determina el ganador
   */
  finishGame(lobby: Lobby): {
    winner: Team;
    finalScores: BullGameState['scores'];
  } {
    if (!lobby.gameState) {
      throw new GameError(
        'El juego no ha sido iniciado',
        ERROR_CODES.INVALID_PHASE
      );
    }

    lobby.gameState.phase = 'finished';
    lobby.status = 'finished';

    const { blue, red } = lobby.gameState.scores;
    const winner: Team = blue > red ? 'blue' : red > blue ? 'red' : 'blue'; // En empate gana azul por simplicidad

    lobby.gameState.winner = winner;

    return {
      winner,
      finalScores: lobby.gameState.scores,
    };
  }

  /**
   * Obtiene la ronda actual
   */
  public getCurrentRound(gameState: BullGameState): BullRound | undefined {
    return gameState.rounds.find((r) => r.number === gameState.currentRound);
  }

  /**
   * Reinicia el juego (solo para el host)
   */
  resetGame(lobby: Lobby): void {
    lobby.gameState = undefined;
    lobby.status = 'waiting';

    // Resetear scores de jugadores
    lobby.players.forEach((player) => {
      player.score = 0;
      player.isReady = false;
    });
  }

  /**
   * Obtiene el estado actual del juego para un jugador
   */
  getGameStateForPlayer(lobby: Lobby, playerId: string): BullGameState | null {
    if (!lobby.gameState) return null;

    // Por ahora retornamos el estado completo
    // En el futuro podríamos filtrar información sensible según el jugador
    return lobby.gameState;
  }
}
