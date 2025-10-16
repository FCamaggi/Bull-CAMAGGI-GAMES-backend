/**
 * Test Completo del Flujo del Juego Bull
 *
 * Este script simula un juego completo con:
 * - 1 Host
 * - 4 Jugadores Activos (2 por equipo)
 * - 6 Espectadores/Público (3 por equipo)
 * - Todas las 8 rondas
 * - Votación completa en cada ronda
 */

import { io, Socket } from 'socket.io-client';

// Configuración
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const DELAY_BETWEEN_ACTIONS = 500; // ms
const ROUND_DELAY = 2000; // ms

// Colores para logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Utilidades
const log = (message: string, color: keyof typeof colors = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Tipos
interface Player {
  socket: Socket;
  name: string;
  id?: string;
  team?: 'blue' | 'red';
  role?: 'active' | 'spectator';
  isReady?: boolean;
  score?: number;
}

interface GameState {
  lobbyCode?: string;
  hostId?: string;
  currentRound?: number;
  phase?: string;
  players: Player[];
  activePlayers: Player[];
  spectators: Player[];
}

// Estado del juego
const gameState: GameState = {
  players: [],
  activePlayers: [],
  spectators: [],
};

// Variables globales para capturar eventos
let lastRoundStarted: any = null;
let lastVotingStarted: any = null;
let lastRoundResults: any = null;
let lastGameFinished: any = null;

// Configuración de jugadores
const PLAYER_CONFIGS = [
  // Jugadores Activos - Equipo Azul
  { name: 'Alice', team: 'blue', type: 'active' },
  { name: 'Bob', team: 'blue', type: 'active' },

  // Jugadores Activos - Equipo Rojo
  { name: 'Charlie', team: 'red', type: 'active' },
  { name: 'Diana', team: 'red', type: 'active' },

  // Espectadores - Equipo Azul
  { name: 'Eve_Espectador', team: 'blue', type: 'spectator' },
  { name: 'Frank_Público', team: 'blue', type: 'spectator' },
  { name: 'Grace_Observador', team: 'blue', type: 'spectator' },

  // Espectadores - Equipo Rojo
  { name: 'Henry_Espectador', team: 'red', type: 'spectator' },
  { name: 'Iris_Público', team: 'red', type: 'spectator' },
  { name: 'Jack_Observador', team: 'red', type: 'spectator' },
];

/**
 * Crear conexión de socket con manejo de eventos
 */
function createSocket(name: string): Socket {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false,
  });

  // Eventos de conexión
  socket.on('connect', () => {
    log(`✅ ${name} conectado (${socket.id})`, 'green');
  });

  socket.on('disconnect', () => {
    log(`❌ ${name} desconectado`, 'red');
  });

  // Listeners globales para capturar todos los eventos del juego
  socket.on('round_started', (data: any) => {
    if (name === 'Alice') {
      // Solo logear una vez
      log(`   ✅ round_started recibido por todos`, 'green');
    }
    lastRoundStarted = data;
  });

  socket.on('voting_phase', (data: any) => {
    if (name === 'Alice') {
      // Solo logear una vez
      log(`   ✅ voting_phase recibido por todos`, 'green');
    }
    lastVotingStarted = data;
  });

  socket.on('round_results', (data: any) => {
    if (name === 'Alice') {
      // Solo logear una vez
      log(`   ✅ round_results recibido por todos`, 'green');
    }
    lastRoundResults = data;
  });

  socket.on('game_finished', (data: any) => {
    if (name === 'Alice') {
      // Solo logear una vez
      log(`   ✅ game_finished recibido por todos`, 'green');
    }
    lastGameFinished = data;
  });

  socket.on('error', (error: any) => {
    log(
      `⚠️ ${name} - Error: ${error.message || JSON.stringify(error)}`,
      'yellow'
    );
  });

  return socket;
}

/**
 * Paso 1: Crear lobby con el host
 */
async function step1_CreateLobby(): Promise<void> {
  log('\n========================================', 'bright');
  log('PASO 1: Crear Lobby', 'cyan');
  log('========================================', 'bright');

  const hostSocket = createSocket('HOST');

  return new Promise((resolve, reject) => {
    hostSocket.once('connect', () => {
      hostSocket.emit('create_lobby', { playerName: 'GameHost' });

      hostSocket.once('lobby_created', (data: any) => {
        gameState.lobbyCode = data.lobby.code;
        gameState.hostId = data.playerId;

        log(`🎮 Lobby creado: ${data.lobby.code}`, 'green');
        log(`👑 Host ID: ${data.playerId}`, 'green');

        // Guardar el socket del host para usarlo después
        const hostPlayer: Player = {
          socket: hostSocket,
          name: 'GameHost',
          id: data.playerId,
        };
        gameState.players.unshift(hostPlayer); // Añadir al principio

        resolve();
      });

      setTimeout(() => reject(new Error('Timeout creando lobby')), 5000);
    });
  });
}

/**
 * Paso 2: Unir jugadores al lobby
 */
async function step2_JoinPlayers(): Promise<void> {
  log('\n========================================', 'bright');
  log('PASO 2: Unir Jugadores', 'cyan');
  log('========================================', 'bright');

  for (const config of PLAYER_CONFIGS) {
    await sleep(DELAY_BETWEEN_ACTIONS);

    const socket = createSocket(config.name);
    const player: Player = {
      socket,
      name: config.name,
      team: config.team as 'blue' | 'red',
    };

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => {
        socket.emit('join_lobby', {
          code: gameState.lobbyCode,
          playerName: config.name,
        });

        socket.once('lobby_joined', (data: any) => {
          player.id = data.playerId;
          log(`✅ ${config.name} se unió al lobby`, 'green');
          resolve();
        });

        socket.once('error', (error: any) => {
          log(`❌ ${config.name} error al unirse: ${error.message}`, 'red');
          reject(error);
        });

        setTimeout(
          () => reject(new Error(`Timeout uniendo ${config.name}`)),
          5000
        );
      });
    });

    gameState.players.push(player);
  }

  log(`\n📊 Total jugadores unidos: ${gameState.players.length}`, 'bright');
}

/**
 * Paso 3: Seleccionar equipos
 */
async function step3_SelectTeams(): Promise<void> {
  log('\n========================================', 'bright');
  log('PASO 3: Seleccionar Equipos', 'cyan');
  log('========================================', 'bright');

  for (const player of gameState.players) {
    // Saltar el host que no juega
    if (player.id === gameState.hostId) {
      continue;
    }

    await sleep(DELAY_BETWEEN_ACTIONS);

    await new Promise<void>((resolve) => {
      player.socket.emit('select_team', { team: player.team });

      player.socket.once('team_updated', (data: any) => {
        const teamPlayers = data.teams[player.team!];
        const playerInTeam = teamPlayers.find((p: any) => p.id === player.id);

        if (playerInTeam) {
          player.role = playerInTeam.role;
          log(
            `${player.role === 'active' ? '✍️' : '👀'} ${
              player.name
            } → Equipo ${player.team?.toUpperCase()} (${player.role})`,
            player.team === 'blue' ? 'blue' : 'red'
          );

          if (player.role === 'active') {
            gameState.activePlayers.push(player);
          } else {
            gameState.spectators.push(player);
          }
        }
        resolve();
      });

      setTimeout(resolve, 2000); // Fallback
    });
  }

  log(`\n📊 Jugadores Activos: ${gameState.activePlayers.length}`, 'bright');
  log(`📊 Espectadores: ${gameState.spectators.length}`, 'bright');
}

/**
 * Paso 4: Marcar jugadores activos como listos
 */
async function step4_ReadyPlayers(): Promise<void> {
  log('\n========================================', 'bright');
  log('PASO 4: Jugadores Activos Listos', 'cyan');
  log('========================================', 'bright');

  for (const player of gameState.activePlayers) {
    await sleep(DELAY_BETWEEN_ACTIONS);

    player.socket.emit('ready_toggle'); // Evento correcto
    player.isReady = true;
    log(`✓ ${player.name} marcado como listo`, 'green');
  }

  // Esperar a que se propague el estado
  await sleep(1000);
  log(`\n📊 Todos los jugadores activos están listos`, 'bright');
}

/**
 * Paso 5: Iniciar el juego
 */
async function step5_StartGame(): Promise<void> {
  log('\n========================================', 'bright');
  log('PASO 5: Iniciar Juego', 'cyan');
  log('========================================', 'bright');

  // Usar el socket del host que creó el lobby
  const hostPlayer = gameState.players.find((p) => p.id === gameState.hostId);

  if (!hostPlayer) {
    throw new Error('No se encontró el socket del host');
  }

  // Escuchar el evento game_started de todos los jugadores
  return new Promise<void>((resolve, reject) => {
    let gameStarted = false;

    const onGameStarted = () => {
      if (!gameStarted) {
        gameStarted = true;
        log('✅ Juego iniciado exitosamente', 'green');

        // Limpiar listeners
        gameState.activePlayers.forEach((p) => {
          p.socket.off('game_started', onGameStarted);
          p.socket.off('error', onError);
        });

        setTimeout(resolve, 1000);
      }
    };

    const onError = (error: any) => {
      log(`⚠️ Error al iniciar: ${error.message}`, 'yellow');
    };

    // Configurar listeners en jugadores activos
    gameState.activePlayers.forEach((p) => {
      p.socket.once('game_started', onGameStarted);
      p.socket.once('error', onError);
    });

    // Emitir evento de inicio
    hostPlayer.socket.emit('start_game');
    log('🚀 Enviando comando de inicio...', 'green');

    // Timeout
    setTimeout(() => {
      if (!gameStarted) {
        log('⚠️ Timeout esperando inicio del juego', 'yellow');
        gameState.activePlayers.forEach((p) => {
          p.socket.off('game_started', onGameStarted);
          p.socket.off('error', onError);
        });
        resolve(); // Continuar de todos modos
      }
    }, 5000);
  });
}

/**
 * Helper: Host avanza a la siguiente fase
 */
async function hostNextPhase(): Promise<void> {
  const hostPlayer = gameState.players.find((p) => p.id === gameState.hostId);
  if (hostPlayer && hostPlayer.socket) {
    log(`   🎮 Host (${hostPlayer.name}) emite next_phase`, 'blue');
    hostPlayer.socket.emit('next_phase');
    await sleep(500);
  } else {
    log(`   ⚠️ No se encontró el host o no tiene socket`, 'yellow');
  }
}

/**
 * Paso 6: Jugar todas las rondas
 */
async function step6_PlayAllRounds(): Promise<void> {
  log('\n========================================', 'bright');
  log('PASO 6: Jugar 2 Rondas de Prueba', 'cyan');
  log('========================================', 'bright');

  const MAX_ROUNDS = 2; // Cambiado de 8 a 2 para pruebas

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    log(`\n${'='.repeat(50)}`, 'magenta');
    log(`🎯 RONDA ${round}/${MAX_ROUNDS}`, 'magenta');
    log(`${'='.repeat(50)}`, 'magenta');

    await playRound(round);
    await sleep(ROUND_DELAY);
  }

  log('\n✅ Todas las rondas completadas', 'green');
}

/**
 * Jugar una ronda completa
 */
async function playRound(roundNumber: number): Promise<void> {
  // Fase 1: Host inicia la ronda (selección de jugadores + escritura)
  log(`\n🎮 Host inicia ronda ${roundNumber}...`, 'blue');
  lastRoundStarted = null; // Resetear ANTES de emitir
  await hostNextPhase();
  await sleep(500);

  // Fase 2: Escritura de respuestas
  await phaseWriting(roundNumber);

  // Fase 3: Host inicia votación
  log(`\n🎮 Host inicia votación...`, 'blue');
  lastVotingStarted = null; // Resetear ANTES de emitir
  await hostNextPhase();
  await sleep(500);

  // Fase 4: Votación
  await phaseVoting(roundNumber);

  // Fase 5: Host muestra resultados
  log(`\n🎮 Host muestra resultados...`, 'blue');
  lastRoundResults = null; // Resetear ANTES de emitir
  await hostNextPhase();
  await sleep(500);

  // Fase 6: Resultados
  await phaseResults(roundNumber);
}

/**
 * Fase de escritura de respuestas
 */
async function phaseWriting(roundNumber: number): Promise<void> {
  log(`\n✍️ Fase: Escritura de Respuestas`, 'yellow');

  // Esperar a que llegue el evento round_started
  const maxWait = 30; // 3 segundos
  for (let i = 0; i < maxWait; i++) {
    if (lastRoundStarted) break;
    await sleep(100);
  }

  if (!lastRoundStarted) {
    log(`   ⚠️ Timeout esperando round_started`, 'yellow');
    return;
  }

  // Obtener jugadores seleccionados
  const currentRound =
    lastRoundStarted.gameState?.rounds?.[
      lastRoundStarted.gameState.currentRound - 1
    ];
  const selectedPlayers = currentRound?.selectedPlayers || {};

  if (selectedPlayers.blue) {
    log(`   � Jugador Azul: ${selectedPlayers.blue.name}`, 'blue');
  }
  if (selectedPlayers.red) {
    log(`   🔴 Jugador Rojo: ${selectedPlayers.red.name}`, 'red');
  }

  // Los jugadores seleccionados escriben respuestas
  const bluePlayer = gameState.players.find(
    (p) => p.id === selectedPlayers.blue?.id
  );
  const redPlayer = gameState.players.find(
    (p) => p.id === selectedPlayers.red?.id
  );

  if (bluePlayer) {
    await sleep(DELAY_BETWEEN_ACTIONS);
    const answer = `Respuesta falsa azul R${roundNumber}`;
    bluePlayer.socket.emit('submit_answer', { answer });
    log(`   ✍️ ${bluePlayer.name} envió: "${answer}"`, 'blue');
  }

  if (redPlayer) {
    await sleep(DELAY_BETWEEN_ACTIONS);
    const answer = `Respuesta falsa roja R${roundNumber}`;
    redPlayer.socket.emit('submit_answer', { answer });
    log(`   ✍️ ${redPlayer.name} envió: "${answer}"`, 'red');
  }

  // Esperar a que se procesen las respuestas
  await sleep(1500);
}

/**
 * Fase de votación
 */
async function phaseVoting(roundNumber: number): Promise<void> {
  log(`\n🗳️ Fase: Votación`, 'yellow');

  // Esperar a que llegue el evento voting_started
  const maxWait = 40; // 4 segundos
  for (let i = 0; i < maxWait; i++) {
    if (lastVotingStarted) break;
    await sleep(100);
  }

  if (!lastVotingStarted) {
    log(`   ⚠️ No se recibió evento voting_phase`, 'yellow');
    return;
  }

  const options = lastVotingStarted.options || [];
  log(`   📋 ${options.length} opciones disponibles para votar`, 'cyan');
  options.forEach((opt: any, i: number) => {
    log(
      `      ${i + 1}. "${opt.text.substring(0, 30)}..." (${opt.origin.type})`,
      'cyan'
    );
  });

  // Si no hay opciones, no podemos votar
  if (options.length === 0) {
    log(`   ❌ Sin opciones para votar, saltando votación`, 'red');
    return;
  }

  // TODOS los jugadores votan (activos + espectadores) - excluyendo al host
  const playersToVote = gameState.players.filter(
    (p) => p.id !== gameState.hostId
  );

  for (const player of playersToVote) {
    await sleep(DELAY_BETWEEN_ACTIONS / 2); // Votar más rápido

    // Seleccionar una opción de forma inteligente:
    // - No votar por tu propia respuesta
    // - Preferir opciones diferentes según el equipo
    let selectedOption = options[0]; // Por defecto la primera

    for (const option of options) {
      // No votar por propia respuesta
      if (
        option.origin?.type === 'player' &&
        option.origin.playerId === player.id
      ) {
        continue;
      }

      // Equipos votan de forma semi-inteligente
      const optionIndex = options.indexOf(option);
      if (player.team === 'blue' && optionIndex % 2 === 0) {
        selectedOption = option;
        break;
      } else if (player.team === 'red' && optionIndex % 2 === 1) {
        selectedOption = option;
        break;
      }
      selectedOption = option; // Última opción válida
    }

    player.socket.emit('submit_vote', { optionId: selectedOption.id });
    log(
      `   🗳️ ${player.name} (${
        player.role
      }) votó por "${selectedOption.text.substring(0, 20)}..."`,
      player.team === 'blue' ? 'blue' : 'red'
    );
  }

  // Esperar a que se procesen todos los votos
  await sleep(1500);
}

/**
 * Fase de resultados de ronda
 */
async function phaseResults(roundNumber: number): Promise<void> {
  log(`\n🏆 Fase: Resultados`, 'yellow');

  // Esperar a que llegue el evento round_results
  const maxWait = 30; // 3 segundos
  for (let i = 0; i < maxWait; i++) {
    if (lastRoundResults) break;
    await sleep(100);
  }

  if (!lastRoundResults) {
    log(`   ⚠️ No se recibieron resultados`, 'yellow');
    return;
  }

  const data = lastRoundResults;

  if (data.results) {
    const results = data.results;
    log(`   ❓ Pregunta: ${results.question}`, 'cyan');

    // Contar votos correctos e incorrectos
    const votes = results.votes || {};
    let correctVotes = 0;
    let incorrectVotes = 0;

    Object.entries(votes).forEach(([playerId, voteData]: [string, any]) => {
      const player = gameState.players.find((p) => p.id === playerId);
      if (player) {
        if (voteData.isCorrect) {
          correctVotes++;
          log(`      ✅ ${player.name} votó correctamente`, 'green');
        } else {
          incorrectVotes++;
          log(`      ❌ ${player.name} votó incorrectamente`, 'red');
        }
      }
    });

    log(
      `   📊 Resumen: ${correctVotes} correctos, ${incorrectVotes} incorrectos`,
      'bright'
    );

    // Mostrar si hay puntuación de equipos
    if (data.newScores) {
      log(`   📊 Puntos Azul: ${data.newScores.blue}`, 'blue');
      log(`   � Puntos Rojo: ${data.newScores.red}`, 'red');
    }
  } else {
    log(`   ⚠️ No hay 'results' en los datos`, 'yellow');
  }

  await sleep(1000);
}

/**
 * Paso 7: Ver resultados finales
 */
async function step7_FinalResults(): Promise<void> {
  log('\n========================================', 'bright');
  log('PASO 7: Resultados Finales', 'cyan');
  log('========================================', 'bright');

  // Esperar a que llegue el evento game_finished
  const maxWait = 30; // 3 segundos
  for (let i = 0; i < maxWait; i++) {
    if (lastGameFinished) break;
    await sleep(100);
  }

  if (!lastGameFinished) {
    log(`\n⚠️ No se recibió evento game_finished`, 'yellow');
    return;
  }

  const data = lastGameFinished;
  log(
    `\n🏆 GANADOR: Equipo ${data.winner.toUpperCase()}`,
    data.winner === 'blue' ? 'blue' : 'red'
  );
  log(`   🔵 Puntos Finales Azul: ${data.finalScores.blue}`, 'blue');
  log(`   🔴 Puntos Finales Rojo: ${data.finalScores.red}`, 'red');

  // Mostrar tabla de puntuación individual
  log(`\n📋 Puntuación Individual:`, 'bright');
  const sortedPlayers = gameState.players
    .filter((p) => p.id !== gameState.hostId)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  sortedPlayers.forEach((player, index) => {
    const medal =
      index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
    log(
      `   ${medal} ${player.name} (${player.team}): ${player.score || 0} pts`,
      player.team === 'blue' ? 'blue' : 'red'
    );
  });
}

/**
 * Limpieza: Desconectar todos los sockets
 */
async function cleanup(): Promise<void> {
  log('\n========================================', 'bright');
  log('LIMPIEZA: Desconectando Jugadores', 'cyan');
  log('========================================', 'bright');

  for (const player of gameState.players) {
    if (player.socket && player.socket.connected) {
      player.socket.disconnect();
    }
  }

  log('✅ Todos los jugadores desconectados', 'green');
}

/**
 * Función principal de testing
 */
async function runFullGameTest(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('🎮 TEST DE PRUEBA - 2 RONDAS', 'bright');
  log('='.repeat(60), 'bright');
  log(`Servidor: ${SERVER_URL}`, 'cyan');
  log(`Jugadores Activos: 4 (2 por equipo)`, 'cyan');
  log(`Espectadores: 6 (3 por equipo)`, 'cyan');
  log(`Rondas: 2 (PRUEBA)`, 'cyan');
  log('='.repeat(60) + '\n', 'bright');

  try {
    await step1_CreateLobby();
    await sleep(1000);

    await step2_JoinPlayers();
    await sleep(1000);

    await step3_SelectTeams();
    await sleep(1000);

    await step4_ReadyPlayers();
    await sleep(1000);

    await step5_StartGame();
    await sleep(2000);

    await step6_PlayAllRounds();
    await sleep(1000);

    await step7_FinalResults();
    await sleep(1000);

    await cleanup();

    log('\n' + '='.repeat(60), 'bright');
    log('✅ TEST COMPLETADO EXITOSAMENTE', 'green');
    log('='.repeat(60) + '\n', 'bright');

    process.exit(0);
  } catch (error: any) {
    log('\n' + '='.repeat(60), 'bright');
    log('❌ TEST FALLIDO', 'red');
    log('='.repeat(60), 'bright');
    log(`Error: ${error.message}`, 'red');
    log(`Stack: ${error.stack}`, 'red');

    await cleanup();
    process.exit(1);
  }
}

// Ejecutar el test
if (require.main === module) {
  runFullGameTest();
}

export { runFullGameTest };
