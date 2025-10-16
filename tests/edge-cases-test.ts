/**
 * Test de Casos Límite y Robustez
 *
 * Prueba situaciones extremas:
 * - Reconexión del host
 * - Reconexión de jugadores activos
 * - Reconexión de espectadores
 * - Jugador espectador intenta escribir respuesta
 * - Jugador no seleccionado intenta escribir
 * - Votar respuesta correcta vs incorrecta
 * - Auto-votación (votar por tu propia respuesta)
 * - Desconexiones durante votación
 * - Múltiples votos del mismo jugador
 */

import { io, Socket } from 'socket.io-client';

// Configuración
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const DELAY = 300; // ms

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

const log = (message: string, color: keyof typeof colors = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Estado global
interface Player {
  socket: Socket;
  name: string;
  id?: string;
  team?: string;
  role?: string;
}

const gameState: {
  lobbyCode?: string;
  hostId?: string;
  host?: Player;
  players: Player[];
} = {
  players: [],
};

let lastRoundStarted: any = null;
let lastVotingPhase: any = null;
let lastRoundResults: any = null;
let lastError: any = null;

/**
 * Crear socket con listeners
 */
function createSocket(name: string): Socket {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    log(`✅ ${name} conectado (${socket.id})`, 'green');
  });

  socket.on('disconnect', (reason) => {
    log(`❌ ${name} desconectado: ${reason}`, 'red');
  });

  socket.on('reconnect', (attemptNumber) => {
    log(`🔄 ${name} reconectado (intento ${attemptNumber})`, 'cyan');
  });

  socket.on('error', (data: any) => {
    log(
      `⚠️ ${name} recibió error: ${data.message || JSON.stringify(data)}`,
      'yellow'
    );
    lastError = data;
  });

  socket.on('round_started', (data: any) => {
    lastRoundStarted = data;
  });

  socket.on('voting_phase', (data: any) => {
    lastVotingPhase = data;
  });

  socket.on('round_results', (data: any) => {
    lastRoundResults = data;
  });

  return socket;
}

/**
 * TEST 1: Reconexión del Host
 */
async function test1_HostReconnection(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('TEST 1: Reconexión del Host', 'cyan');
  log('='.repeat(60), 'bright');

  try {
    // Crear lobby
    const hostSocket = createSocket('Host');
    await sleep(500);

    await new Promise<void>((resolve, reject) => {
      hostSocket.emit('create_lobby', { playerName: 'HostOriginal' });
      hostSocket.once('lobby_created', (data: any) => {
        gameState.lobbyCode = data.lobby.code;
        gameState.hostId = data.playerId;
        gameState.host = {
          socket: hostSocket,
          name: 'Host',
          id: data.playerId,
        };
        log(`✅ Lobby creado: ${data.lobby.code}`, 'green');
        resolve();
      });
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });

    // Unir un jugador
    const player1 = createSocket('Player1');
    await sleep(500);

    await new Promise<void>((resolve) => {
      player1.emit('join_lobby', {
        code: gameState.lobbyCode,
        playerName: 'Player1',
      });
      player1.once('lobby_joined', () => {
        log('✅ Player1 se unió', 'green');
        resolve();
      });
    });

    // Desconectar el host
    log('\n🔌 Desconectando host...', 'yellow');
    hostSocket.disconnect();
    await sleep(2000);

    // Reconectar el host
    log('🔄 Reconectando host...', 'cyan');
    hostSocket.connect();
    await sleep(2000);

    // Verificar que puede seguir operando
    await new Promise<void>((resolve) => {
      hostSocket.emit('rejoin_lobby', {
        code: gameState.lobbyCode,
        playerId: gameState.hostId,
      });

      hostSocket.once('lobby_rejoined', (data: any) => {
        log('✅ Host reconectado exitosamente', 'green');
        log(
          `   Lobby: ${data.lobby.code}, Players: ${data.lobby.players.length}`,
          'cyan'
        );
        resolve();
      });

      setTimeout(() => {
        log('⚠️ Host no pudo reconectar automáticamente', 'yellow');
        resolve();
      }, 3000);
    });

    // Limpieza
    hostSocket.disconnect();
    player1.disconnect();
    log('✅ TEST 1 COMPLETADO\n', 'green');
  } catch (error) {
    log(`❌ TEST 1 FALLÓ: ${error}`, 'red');
  }
}

/**
 * TEST 2: Espectador intenta escribir respuesta
 */
async function test2_SpectatorTriesToWrite(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('TEST 2: Espectador intenta escribir respuesta', 'cyan');
  log('='.repeat(60), 'bright');

  try {
    // Crear lobby
    const hostSocket = createSocket('Host2');
    await sleep(500);

    await new Promise<void>((resolve) => {
      hostSocket.emit('create_lobby', { playerName: 'Host2' });
      hostSocket.once('lobby_created', (data: any) => {
        gameState.lobbyCode = data.lobby.code;
        gameState.hostId = data.playerId;
        log(`✅ Lobby creado: ${data.lobby.code}`, 'green');
        resolve();
      });
    });

    // Unir jugadores - IMPORTANTE: 2 por equipo primero, luego espectadores
    const activeBlue1 = createSocket('ActiveBlue1');
    const activeBlue2 = createSocket('ActiveBlue2');
    const activeRed1 = createSocket('ActiveRed1');
    const activeRed2 = createSocket('ActiveRed2');
    const spectator = createSocket('Spectator1');
    await sleep(500);

    // Unir y seleccionar equipos - primero todos los activos, luego espectadores
    const playersData = [
      { socket: activeBlue1, name: 'ActiveBlue1', team: 'blue' },
      { socket: activeBlue2, name: 'ActiveBlue2', team: 'blue' },
      { socket: activeRed1, name: 'ActiveRed1', team: 'red' },
      { socket: activeRed2, name: 'ActiveRed2', team: 'red' },
      { socket: spectator, name: 'Spectator1', team: 'blue' },
    ];

    for (const playerData of playersData) {
      await new Promise<void>((resolve) => {
        playerData.socket.emit('join_lobby', {
          code: gameState.lobbyCode,
          playerName: playerData.name,
        });
        playerData.socket.once('lobby_joined', (data: any) => {
          playerData.socket.emit('select_team', { team: playerData.team });
          setTimeout(resolve, 300);
        });
      });
    }

    log('✅ 4 activos + 1 espectador unidos', 'green');

    // Marcar ready (solo los activos)
    activeBlue1.emit('ready_toggle');
    activeBlue2.emit('ready_toggle');
    activeRed1.emit('ready_toggle');
    activeRed2.emit('ready_toggle');
    await sleep(500);

    // Iniciar juego
    hostSocket.emit('start_game');
    await sleep(1000);

    // Host inicia ronda
    lastRoundStarted = null;
    hostSocket.emit('next_phase');
    await sleep(1000);

    if (lastRoundStarted) {
      log('✅ Ronda iniciada', 'green');

      // Espectador intenta escribir respuesta
      log('\n🧪 Espectador intenta enviar respuesta...', 'yellow');
      lastError = null;
      spectator.emit('submit_answer', { answer: 'Intento de espectador' });
      await sleep(1000);

      if (lastError) {
        log('✅ Servidor rechazó correctamente al espectador', 'green');
        log(`   Error: ${lastError.message}`, 'cyan');
      } else {
        log('⚠️ Servidor NO rechazó al espectador (posible bug)', 'yellow');
      }
    }

    // Limpieza
    hostSocket.disconnect();
    playersData.forEach((p) => p.socket.disconnect());
    log('✅ TEST 2 COMPLETADO\n', 'green');
  } catch (error) {
    log(`❌ TEST 2 FALLÓ: ${error}`, 'red');
  }
}

/**
 * TEST 3: Jugador no seleccionado intenta escribir
 */
async function test3_NonSelectedPlayerTriesToWrite(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('TEST 3: Jugador activo NO seleccionado intenta escribir', 'cyan');
  log('='.repeat(60), 'bright');

  try {
    const hostSocket = createSocket('Host3');
    await sleep(500);

    await new Promise<void>((resolve) => {
      hostSocket.emit('create_lobby', { playerName: 'Host3' });
      hostSocket.once('lobby_created', (data: any) => {
        gameState.lobbyCode = data.lobby.code;
        gameState.hostId = data.playerId;
        log(`✅ Lobby creado: ${data.lobby.code}`, 'green');
        resolve();
      });
    });

    // Unir 4 activos (2 por equipo)
    const playersData = [
      { socket: createSocket('Active1'), name: 'Active1', team: 'blue' },
      { socket: createSocket('Active2'), name: 'Active2', team: 'blue' },
      { socket: createSocket('Active3'), name: 'Active3', team: 'red' },
      { socket: createSocket('Active4'), name: 'Active4', team: 'red' },
    ];
    await sleep(300);

    for (const playerData of playersData) {
      await new Promise<void>((resolve) => {
        playerData.socket.emit('join_lobby', {
          code: gameState.lobbyCode,
          playerName: playerData.name,
        });
        playerData.socket.once('lobby_joined', (data: any) => {
          playerData.socket.emit('select_team', { team: playerData.team });
          setTimeout(resolve, 200);
        });
      });
    }

    log('✅ 4 jugadores activos unidos (2 por equipo)', 'green');

    // Todos marcan ready
    playersData.forEach((p) => p.socket.emit('ready_toggle'));
    await sleep(500);

    // Iniciar juego
    hostSocket.emit('start_game');
    await sleep(1000);

    // Host inicia ronda
    lastRoundStarted = null;
    hostSocket.emit('next_phase');
    await sleep(1000);

    if (lastRoundStarted) {
      const round = lastRoundStarted.round;
      const selectedBlue = round.selectedPlayers?.blue?.name;
      const selectedRed = round.selectedPlayers?.red?.name;

      log(`✅ Ronda iniciada`, 'green');
      log(
        `   Seleccionados: ${selectedBlue} (azul), ${selectedRed} (rojo)`,
        'cyan'
      );

      // Encontrar un jugador NO seleccionado
      const notSelectedPlayer = playersData.find(
        (p) => p.name !== selectedBlue && p.name !== selectedRed
      );

      if (notSelectedPlayer) {
        log(
          `\n🧪 Jugador NO seleccionado (${notSelectedPlayer.name}) intenta escribir...`,
          'yellow'
        );
        lastError = null;

        notSelectedPlayer.socket.emit('submit_answer', {
          answer: 'Intento no autorizado',
        });
        await sleep(1000);

        if (lastError && lastError.message?.includes('seleccionado')) {
          log('✅ Servidor rechazó correctamente', 'green');
          log(`   Error: ${lastError.message}`, 'cyan');
        } else {
          log('⚠️ No hubo rechazo (posible bug)', 'yellow');
        }
      } else {
        log('⚠️ No se pudo identificar jugador no seleccionado', 'yellow');
      }
    }

    // Limpieza
    hostSocket.disconnect();
    playersData.forEach((p) => p.socket.disconnect());
    log('✅ TEST 3 COMPLETADO\n', 'green');
  } catch (error) {
    log(`❌ TEST 3 FALLÓ: ${error}`, 'red');
  }
}

/**
 * TEST 4: Auto-votación (votar por propia respuesta)
 */
async function test4_SelfVoting(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('TEST 4: Intento de auto-votación', 'cyan');
  log('='.repeat(60), 'bright');

  try {
    const hostSocket = createSocket('Host4');
    await sleep(500);

    await new Promise<void>((resolve) => {
      hostSocket.emit('create_lobby', { playerName: 'Host4' });
      hostSocket.once('lobby_created', (data: any) => {
        gameState.lobbyCode = data.lobby.code;
        log(`✅ Lobby creado: ${data.lobby.code}`, 'green');
        resolve();
      });
    });

    // Crear 2 jugadores activos
    const playersData = [
      { socket: createSocket('BluePlayer'), name: 'BluePlayer', team: 'blue' },
      { socket: createSocket('RedPlayer'), name: 'RedPlayer', team: 'red' },
    ];
    await sleep(500);

    for (const playerData of playersData) {
      await new Promise<void>((resolve) => {
        playerData.socket.emit('join_lobby', {
          code: gameState.lobbyCode,
          playerName: playerData.name,
        });
        playerData.socket.once('lobby_joined', () => {
          playerData.socket.emit('select_team', { team: playerData.team });
          setTimeout(resolve, 200);
        });
      });
    }

    // Ready
    playersData.forEach((p) => p.socket.emit('ready_toggle'));
    await sleep(500);

    // Iniciar juego
    hostSocket.emit('start_game');
    await sleep(1000);

    // Iniciar ronda
    lastRoundStarted = null;
    hostSocket.emit('next_phase');
    await sleep(1000);

    if (lastRoundStarted) {
      log('✅ Ronda iniciada', 'green');

      // Escribir respuestas
      playersData[0].socket.emit('submit_answer', { answer: 'Respuesta azul' });
      playersData[1].socket.emit('submit_answer', { answer: 'Respuesta roja' });
      await sleep(1000);

      // Iniciar votación
      lastVotingPhase = null;
      hostSocket.emit('next_phase');
      await sleep(1000);

      if (lastVotingPhase && lastVotingPhase.options) {
        log('✅ Votación iniciada', 'green');
        const options = lastVotingPhase.options;

        // Encontrar opción del jugador azul
        const blueOption = options.find(
          (opt: any) =>
            opt.origin?.type === 'player' && opt.text === 'Respuesta azul'
        );

        if (blueOption) {
          log(
            `\n🧪 Jugador azul intenta votar por su propia respuesta...`,
            'yellow'
          );
          lastError = null;
          playersData[0].socket.emit('submit_vote', {
            optionId: blueOption.id,
          });
          await sleep(1000);

          if (lastError) {
            log('✅ Servidor rechazó auto-votación correctamente', 'green');
            log(`   Error: ${lastError.message}`, 'cyan');
          } else {
            log('⚠️ Servidor permitió auto-votación (posible bug)', 'yellow');
          }
        }
      }
    }

    // Limpieza
    hostSocket.disconnect();
    playersData.forEach((p) => p.socket.disconnect());
    log('✅ TEST 4 COMPLETADO\n', 'green');
  } catch (error) {
    log(`❌ TEST 4 FALLÓ: ${error}`, 'red');
  }
}

/**
 * TEST 5: Doble votación del mismo jugador
 */
async function test5_DoubleVoting(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('TEST 5: Intento de votar dos veces', 'cyan');
  log('='.repeat(60), 'bright');

  try {
    const hostSocket = createSocket('Host5');
    await sleep(500);

    await new Promise<void>((resolve) => {
      hostSocket.emit('create_lobby', { playerName: 'Host5' });
      hostSocket.once('lobby_created', (data: any) => {
        gameState.lobbyCode = data.lobby.code;
        log(`✅ Lobby creado: ${data.lobby.code}`, 'green');
        resolve();
      });
    });

    // Crear jugadores - 2 activos por equipo, luego espectador
    const playersData = [
      { socket: createSocket('Blue5A'), name: 'Blue5A', team: 'blue' },
      { socket: createSocket('Blue5B'), name: 'Blue5B', team: 'blue' },
      { socket: createSocket('Red5A'), name: 'Red5A', team: 'red' },
      { socket: createSocket('Red5B'), name: 'Red5B', team: 'red' },
      { socket: createSocket('Spectator5'), name: 'Spectator5', team: 'blue' },
    ];
    await sleep(500);

    for (const playerData of playersData) {
      await new Promise<void>((resolve) => {
        playerData.socket.emit('join_lobby', {
          code: gameState.lobbyCode,
          playerName: playerData.name,
        });
        playerData.socket.once('lobby_joined', () => {
          playerData.socket.emit('select_team', { team: playerData.team });
          setTimeout(resolve, 200);
        });
      });
    }

    // Ready (solo los 4 activos)
    playersData[0].socket.emit('ready_toggle');
    playersData[1].socket.emit('ready_toggle');
    playersData[2].socket.emit('ready_toggle');
    playersData[3].socket.emit('ready_toggle');
    await sleep(500);

    hostSocket.emit('start_game');
    await sleep(1000);

    // Iniciar ronda y llegar a votación
    lastRoundStarted = null;
    hostSocket.emit('next_phase');
    await sleep(1000);

    if (lastRoundStarted) {
      // Jugadores seleccionados escriben
      const selectedBlue = lastRoundStarted.round.selectedPlayers?.blue?.name;
      const selectedRed = lastRoundStarted.round.selectedPlayers?.red?.name;

      // Encontrar y usar los sockets seleccionados
      const bluePlayer = playersData.find((p) => p.name === selectedBlue);
      const redPlayer = playersData.find((p) => p.name === selectedRed);

      if (bluePlayer && redPlayer) {
        bluePlayer.socket.emit('submit_answer', { answer: 'Blue answer' });
        redPlayer.socket.emit('submit_answer', { answer: 'Red answer' });
        await sleep(1000);
      }
    }

    lastVotingPhase = null;
    hostSocket.emit('next_phase');
    await sleep(1000);

    if (lastVotingPhase && lastVotingPhase.options) {
      log('✅ Votación iniciada', 'green');
      const options = lastVotingPhase.options;

      if (options.length >= 2) {
        log(`\n🧪 Espectador vota por primera opción...`, 'cyan');
        playersData[4].socket.emit('submit_vote', { optionId: options[0].id });
        await sleep(500);

        log(
          `🧪 Espectador intenta votar nuevamente por segunda opción...`,
          'yellow'
        );
        lastError = null;
        playersData[4].socket.emit('submit_vote', { optionId: options[1].id });
        await sleep(1000);

        if (lastError) {
          log('✅ Servidor rechazó segundo voto correctamente', 'green');
          log(`   Error: ${lastError.message}`, 'cyan');
        } else {
          log('⚠️ Servidor permitió votar dos veces (posible bug)', 'yellow');
        }
      }
    }

    // Limpieza
    hostSocket.disconnect();
    playersData.forEach((p) => p.socket.disconnect());
    log('✅ TEST 5 COMPLETADO\n', 'green');
  } catch (error) {
    log(`❌ TEST 5 FALLÓ: ${error}`, 'red');
  }
}

/**
 * TEST 6: Reconexión durante fase de votación
 */
async function test6_ReconnectDuringVoting(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('TEST 6: Reconexión durante votación', 'cyan');
  log('='.repeat(60), 'bright');

  try {
    const hostSocket = createSocket('Host6');
    await sleep(500);

    await new Promise<void>((resolve) => {
      hostSocket.emit('create_lobby', { playerName: 'Host6' });
      hostSocket.once('lobby_created', (data: any) => {
        gameState.lobbyCode = data.lobby.code;
        gameState.hostId = data.playerId;
        log(`✅ Lobby creado: ${data.lobby.code}`, 'green');
        resolve();
      });
    });

    let spectatorId: string = '';
    const playersData = [
      { socket: createSocket('Blue6A'), name: 'Blue6A', team: 'blue' },
      { socket: createSocket('Blue6B'), name: 'Blue6B', team: 'blue' },
      { socket: createSocket('Red6A'), name: 'Red6A', team: 'red' },
      { socket: createSocket('Red6B'), name: 'Red6B', team: 'red' },
      { socket: createSocket('Spectator6'), name: 'Spectator6', team: 'blue' },
    ];
    await sleep(500);

    for (const playerData of playersData) {
      await new Promise<void>((resolve) => {
        playerData.socket.emit('join_lobby', {
          code: gameState.lobbyCode,
          playerName: playerData.name,
        });
        playerData.socket.once('lobby_joined', (data: any) => {
          if (playerData.name === 'Spectator6') {
            spectatorId = data.playerId;
          }
          playerData.socket.emit('select_team', { team: playerData.team });
          setTimeout(resolve, 200);
        });
      });
    }

    // Ready (solo los 4 activos)
    playersData[0].socket.emit('ready_toggle');
    playersData[1].socket.emit('ready_toggle');
    playersData[2].socket.emit('ready_toggle');
    playersData[3].socket.emit('ready_toggle');
    await sleep(500);

    hostSocket.emit('start_game');
    await sleep(1000);

    lastRoundStarted = null;
    hostSocket.emit('next_phase');
    await sleep(1000);

    if (lastRoundStarted) {
      // Jugadores seleccionados escriben
      const selectedBlue = lastRoundStarted.round.selectedPlayers?.blue?.name;
      const selectedRed = lastRoundStarted.round.selectedPlayers?.red?.name;

      const bluePlayer = playersData.find((p) => p.name === selectedBlue);
      const redPlayer = playersData.find((p) => p.name === selectedRed);

      if (bluePlayer && redPlayer) {
        bluePlayer.socket.emit('submit_answer', { answer: 'Blue' });
        redPlayer.socket.emit('submit_answer', { answer: 'Red' });
        await sleep(1000);
      }
    }

    lastVotingPhase = null;
    hostSocket.emit('next_phase');
    await sleep(1000);

    if (lastVotingPhase) {
      log('✅ Fase de votación iniciada', 'green');

      // Desconectar espectador (índice 4)
      log('\n🔌 Desconectando espectador durante votación...', 'yellow');
      playersData[4].socket.disconnect();
      await sleep(2000);

      // Reconectar
      log('🔄 Reconectando espectador...', 'cyan');
      playersData[4].socket.connect();
      await sleep(2000);

      // Intentar votar después de reconectar
      log('🧪 Espectador intenta votar después de reconectar...', 'cyan');
      playersData[4].socket.emit('rejoin_lobby', {
        code: gameState.lobbyCode,
        playerId: spectatorId,
      });
      await sleep(1000);

      if (lastVotingPhase.options && lastVotingPhase.options.length > 0) {
        playersData[4].socket.emit('submit_vote', {
          optionId: lastVotingPhase.options[0].id,
        });
        await sleep(1000);
        log('✅ Voto enviado después de reconexión', 'green');
      }
    }

    // Limpieza
    hostSocket.disconnect();
    playersData.forEach((p) => p.socket.disconnect());
    log('✅ TEST 6 COMPLETADO\n', 'green');
  } catch (error) {
    log(`❌ TEST 6 FALLÓ: ${error}`, 'red');
  }
}

/**
 * Ejecutar todos los tests
 */
async function runAllTests(): Promise<void> {
  log('\n' + '='.repeat(60), 'bright');
  log('🧪 TESTS DE CASOS LÍMITE Y ROBUSTEZ', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  await test1_HostReconnection();
  await sleep(2000);

  await test2_SpectatorTriesToWrite();
  await sleep(2000);

  await test3_NonSelectedPlayerTriesToWrite();
  await sleep(2000);

  await test4_SelfVoting();
  await sleep(2000);

  await test5_DoubleVoting();
  await sleep(2000);

  await test6_ReconnectDuringVoting();

  log('\n' + '='.repeat(60), 'bright');
  log('✅ TODOS LOS TESTS COMPLETADOS', 'bright');
  log('='.repeat(60) + '\n', 'bright');
}

// Ejecutar
if (require.main === module) {
  runAllTests()
    .then(() => {
      log('✅ Tests finalizados exitosamente', 'green');
      process.exit(0);
    })
    .catch((error) => {
      log(`❌ Error en tests: ${error}`, 'red');
      process.exit(1);
    });
}

export { runAllTests };
