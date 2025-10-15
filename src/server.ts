import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';

import { SocketService } from './services/socketService';
import { LobbyService } from './services/lobbyService';
import { GameService } from './services/gameService';
import {
  DEFAULT_PORT,
  DEFAULT_FRONTEND_URL,
  CLEANUP_INTERVAL_MS,
} from './utils/constants';

// Cargar variables de entorno
dotenv.config();

/**
 * Servidor principal del juego Bull
 */
class BullServer {
  private app: express.Application;
  private server: any;
  private socketService!: SocketService;
  private lobbyService: LobbyService;
  private gameService: GameService;
  private cleanupInterval?: any;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.lobbyService = new LobbyService();
    this.gameService = new GameService();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupServices();
    this.setupCleanup();
  }

  /**
   * Configura middleware de Express
   */
  private setupMiddleware(): void {
    // Seguridad básica
    this.app.use(
      helmet({
        contentSecurityPolicy: false, // Permitir WebSocket
      })
    );

    // CORS - Permitir localhost y Netlify
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3002', // Vite puede usar puerto diferente
      'http://localhost:5173', // Vite default port
      'https://bull-camaggi-games.netlify.app', // Tu dominio de Netlify
      'https://*.netlify.app', // Otros subdominios de Netlify
      process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL,
    ].filter(Boolean);

    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Permitir requests sin origin (ej: mobile apps, Postman)
          if (!origin) return callback(null, true);

          // Verificar si el origin está en la lista permitida o es un subdominio de Netlify
          const isAllowed = allowedOrigins.some(
            (allowed) =>
              origin === allowed ||
              (allowed.includes('*.netlify.app') &&
                origin.endsWith('.netlify.app'))
          );

          if (isAllowed) {
            callback(null, true);
          } else {
            console.warn(`⚠️  Origin no permitido: ${origin}`);
            callback(null, true); // En desarrollo, permitir todos
          }
        },
        credentials: true,
      })
    );

    // JSON parsing
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging básico
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`${timestamp} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Configura rutas HTTP
   */
  private setupRoutes(): void {
    // Ruta raíz - información del servidor
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Bull Game Backend API',
        version: '1.0.0',
        status: 'running',
        frontend: 'https://bull-camaggi-games.netlify.app',
        endpoints: {
          health: '/health',
          stats: '/api/stats',
          websocket: 'ws://bull-game-backend.onrender.com'
        },
        timestamp: new Date().toISOString(),
      });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      const stats = this.socketService ? this.socketService.getStats() : {};
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        ...stats,
      });
    });

    // API básica de estadísticas
    this.app.get('/api/stats', (req, res) => {
      if (!this.socketService) {
        return res.status(503).json({ error: 'Servicio no disponible' });
      }

      return res.json(this.socketService.getStats());
    });

    // Servir archivos estáticos del frontend (solo en desarrollo local)
    // En producción, el frontend está desplegado separadamente en Netlify
    if (process.env.NODE_ENV !== 'production') {
      const frontendPath = path.join(__dirname, '../../frontend/dist');
      
      // Intentar servir archivos estáticos
      this.app.use(express.static(frontendPath));

      // Catch-all handler para SPA
      this.app.get('*', (req, res, next) => {
        // Si es una ruta de API o health, pasar al siguiente handler
        if (req.path.startsWith('/api') || 
            req.path.startsWith('/health') || 
            req.path === '/') {
          return next();
        }
        
        res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
          if (err) {
            res.status(404).json({ 
              message: 'Frontend no disponible en este servidor',
              frontend_url: 'https://bull-camaggi-games.netlify.app'
            });
          }
        });
      });
    }

    // 404 handler para rutas API no encontradas
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({ error: `Ruta no encontrada: ${req.path}` });
    });

    // Error handler global
    this.app.use((err: any, req: any, res: any, next: any) => {
      console.error('Error en servidor:', err);
      res.status(500).json({
        error: 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { details: err.message }),
      });
    });
  }

  /**
   * Configura servicios WebSocket
   */
  private setupServices(): void {
    const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;

    this.socketService = new SocketService(
      this.server,
      frontendUrl,
      this.lobbyService,
      this.gameService
    );

    console.log('Servicios WebSocket configurados');
  }

  /**
   * Configura limpieza automática de lobbies
   */
  private setupCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      try {
        this.lobbyService.cleanupInactiveLobbies();
      } catch (error) {
        console.error('Error en limpieza automática:', error);
      }
    }, CLEANUP_INTERVAL_MS);

    console.log('Limpieza automática configurada');
  }

  /**
   * Inicia el servidor
   */
  public start(): void {
    const port = parseInt(process.env.PORT || DEFAULT_PORT.toString());

    this.server.listen(port, () => {
      console.log('🎯 Servidor Bull iniciado');
      console.log(`📡 Puerto: ${port}`);
      console.log(
        `🌐 Frontend URL: ${process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL}`
      );
      console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log('');
      console.log('Listo para recibir conexiones! 🚀');
    });

    // Manejo de señales para cierre limpio
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  /**
   * Cierra el servidor limpiamente
   */
  private shutdown(signal: string): void {
    console.log(`\n🛑 Recibida señal ${signal}, cerrando servidor...`);

    // Limpiar interval de cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cerrar servicios WebSocket
    if (this.socketService) {
      this.socketService.cleanup();
    }

    // Cerrar servidor HTTP
    this.server.close(() => {
      console.log('✅ Servidor cerrado limpiamente');
      process.exit(0);
    });

    // Forzar cierre después de 10 segundos
    setTimeout(() => {
      console.log('⚠️  Forzando cierre del servidor');
      process.exit(1);
    }, 10000);
  }
}

// Iniciar servidor si este archivo se ejecuta directamente
if (require.main === module) {
  const server = new BullServer();
  server.start();
}

export default BullServer;
