# Tests del Juego Bull

## Tests Automatizados

Este directorio contiene tests automatizados para verificar el funcionamiento del juego Bull.

## Tipos de Tests

### 1. `full-game-test.ts` - Test Completo del Flujo

Test completo que simula un juego real con:

- **1 Host** que crea y controla el lobby
- **4 Jugadores Activos** (2 por equipo) que escriben respuestas
- **6 Espectadores/Público** (3 por equipo) que solo votan
- **8 Rondas completas** con escritura y votación
- **Verificación de roles** (active vs spectator)
- **Verificación de puntuación** (100 pts por acierto, 50 pts por confusión)

### 2. `edge-cases-test.ts` - Tests de Casos Límite

Prueba situaciones extremas y manejo de errores:

- **Test 1**: Reconexión del host durante el juego
- **Test 2**: Espectador intenta escribir respuesta (debe ser rechazado)
- **Test 3**: Jugador activo NO seleccionado intenta escribir
- **Test 4**: Auto-votación (jugador vota por su propia respuesta)
- **Test 5**: Doble votación del mismo jugador
- **Test 6**: Reconexión de jugador durante fase de votación

## Requisitos

1. **Servidor corriendo**: El backend debe estar ejecutándose
2. **Dependencias instaladas**: Ejecutar `npm install` primero

## Cómo ejecutar los tests

### Test Completo del Flujo (Recomendado)

```bash
# Usando el script que inicia/detiene el servidor automáticamente
cd backend
./tests/run-test.sh
```

### Tests de Casos Límite

```bash
# Usando el script automático
cd backend
./tests/run-edge-test.sh
```

### Ejecución manual (requiere servidor corriendo)

```bash
# Terminal 1: Iniciar servidor
npm run dev

# Terminal 2: Ejecutar test
npm run test:full    # Test completo
npm run test:edge    # Tests de casos límite
```

### Opción 2: Usando tsx directamente

```bash
# Desde el directorio backend/
npx tsx tests/full-game-test.ts
```

### Opción 3: Con variable de entorno personalizada

```bash
# Cambiar la URL del servidor si no es localhost:3001
SERVER_URL=http://localhost:8080 npm run test:full
```

## Preparación

### 1. Instalar dependencias

```bash
cd backend
npm install
```

### 2. Iniciar el servidor en una terminal

```bash
npm run dev
```

### 3. En otra terminal, ejecutar el test

```bash
npm run test:full
```

## Qué verifica el test

### ✅ Funcionalidades Verificadas

1. **Creación de Lobby**

   - Host puede crear lobby
   - Se genera código único

2. **Unión de Jugadores**

   - 10 jugadores pueden unirse (4 activos + 6 espectadores)
   - Nombres únicos por lobby

3. **Asignación de Roles**

   - Primeros 2 por equipo → `active`
   - Jugadores 3+ por equipo → `spectator`
   - Validación de MAX_ACTIVE_PLAYERS_PER_TEAM = 2

4. **Sistema de Ready**

   - Solo jugadores activos pueden marcar ready
   - Espectadores no necesitan ready

5. **Inicio del Juego**

   - Requiere al menos 1 activo por equipo
   - Todos los activos deben estar listos

6. **Fase de Escritura**

   - Solo jugadores activos seleccionados escriben
   - Espectadores esperan

7. **Fase de Votación**

   - TODOS votan (activos + espectadores)
   - No se puede votar por respuesta propia
   - 10 votos totales por ronda

8. **Sistema de Puntuación**

   - +100 por acertar
   - +50 por confundir oponente
   - Puntos acumulados correctamente

9. **8 Rondas Completas**

   - Todas las rondas se juegan
   - Ronda 8 es jugable (bug anterior corregido)

10. **Resultados Finales**
    - Se determina ganador
    - Puntuaciones finales correctas

## Salida del Test

El test mostrará logs con colores indicando:

- 🟢 Verde: Operaciones exitosas
- 🔵 Azul: Acciones del equipo azul
- 🔴 Rojo: Acciones del equipo rojo
- 🟡 Amarillo: Fases del juego
- 🟣 Magenta: Inicio de rondas
- 🔶 Cyan: Pasos principales

### Ejemplo de salida:

```
============================================================
🎮 TEST COMPLETO DEL JUEGO BULL
============================================================
Servidor: http://localhost:3001
Jugadores Activos: 4 (2 por equipo)
Espectadores: 6 (3 por equipo)
Rondas: 8
============================================================

========================================
PASO 1: Crear Lobby
========================================
✅ HOST conectado (abc123)
🎮 Lobby creado: XYZ789
👑 Host ID: host-id-123

========================================
PASO 2: Unir Jugadores
========================================
✅ Alice se unió al lobby
✅ Bob se unió al lobby
✅ Charlie se unió al lobby
...

========================================
PASO 3: Seleccionar Equipos
========================================
✍️ Alice → Equipo BLUE (active)
✍️ Bob → Equipo BLUE (active)
✍️ Charlie → Equipo RED (active)
✍️ Diana → Equipo RED (active)
👀 Eve_Espectador → Equipo BLUE (spectator)
...

==================================================
🎯 RONDA 1/8
==================================================

✍️ Fase: Escritura de Respuestas
   🔵 Jugador Azul: Alice
   🔴 Jugador Rojo: Charlie
   ✍️ Alice envió: "Respuesta falsa azul R1"
   ✍️ Charlie envió: "Respuesta falsa roja R1"

🗳️ Fase: Votación
   📋 4 opciones disponibles para votar
   🗳️ Alice (active) votó
   🗳️ Bob (active) votó
   🗳️ Eve_Espectador (spectator) votó
   ...

🏆 Fase: Resultados
   📊 Puntos Azul: 150
   📊 Puntos Rojo: 200

...

========================================
PASO 7: Resultados Finales
========================================

🏆 GANADOR: Equipo BLUE
   🔵 Puntos Finales Azul: 850
   🔴 Puntos Finales Rojo: 700

============================================================
✅ TEST COMPLETADO EXITOSAMENTE
============================================================
```

## Troubleshooting

### Error: "Cannot connect to server"

- Asegúrate de que el servidor esté corriendo en `http://localhost:3001`
- Verifica que el puerto no esté bloqueado
- Usa `SERVER_URL` para cambiar la URL si es necesario

### Error: "Timeout creating lobby"

- El servidor puede estar tardando en responder
- Verifica los logs del servidor
- Aumenta los timeouts en el código si es necesario

### Error: "Player already exists"

- Los nombres de jugadores deben ser únicos
- Reinicia el servidor para limpiar lobbies antiguos
- Modifica los nombres en `PLAYER_CONFIGS` si es necesario

## Personalización

### Cambiar configuración de jugadores

Edita `PLAYER_CONFIGS` en `full-game-test.ts`:

```typescript
const PLAYER_CONFIGS = [
  { name: 'TuNombre', team: 'blue', type: 'active' },
  // ... más jugadores
];
```

### Cambiar delays

```typescript
const DELAY_BETWEEN_ACTIONS = 500; // ms entre acciones
const ROUND_DELAY = 2000; // ms entre rondas
```

### Agregar más espectadores

Simplemente añade más entradas con `type: 'spectator'` en `PLAYER_CONFIGS`.

## Tests Futuros

- [ ] Test de reconexión de jugadores
- [ ] Test de desconexión durante el juego
- [ ] Test de validaciones (respuestas inválidas, votos duplicados)
- [ ] Test de performance (100+ jugadores)
- [ ] Test de múltiples lobbies simultáneos
