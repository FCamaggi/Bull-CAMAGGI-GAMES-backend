/**
 * Banco de preguntas para el juego Bull
 * Cada pregunta debe ser específica y tener una respuesta verificable
 */

export interface Question {
  id: string;
  text: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  correctAnswer?: string; // Solo para referencia, no se usa en el juego
}

export const QUESTION_BANK: Question[] = [
  // Historia
  {
    id: 'hist_001',
    text: '¿En qué año terminó la Segunda Guerra Mundial?',
    category: 'Historia',
    difficulty: 'easy',
    correctAnswer: '1945',
  },
  {
    id: 'hist_002',
    text: '¿Quién fue el primer presidente de Estados Unidos?',
    category: 'Historia',
    difficulty: 'easy',
    correctAnswer: 'George Washington',
  },
  {
    id: 'hist_003',
    text: '¿En qué año llegó Cristóbal Colón a América?',
    category: 'Historia',
    difficulty: 'easy',
    correctAnswer: '1492',
  },
  {
    id: 'hist_004',
    text: '¿Qué civilización construyó Machu Picchu?',
    category: 'Historia',
    difficulty: 'medium',
    correctAnswer: 'Los Incas',
  },
  {
    id: 'hist_005',
    text: '¿En qué año cayó el Muro de Berlín?',
    category: 'Historia',
    difficulty: 'medium',
    correctAnswer: '1989',
  },

  // Geografía
  {
    id: 'geo_001',
    text: '¿Cuál es la capital de Australia?',
    category: 'Geografía',
    difficulty: 'medium',
    correctAnswer: 'Canberra',
  },
  {
    id: 'geo_002',
    text: '¿Cuál es el río más largo del mundo?',
    category: 'Geografía',
    difficulty: 'easy',
    correctAnswer: 'El Nilo',
  },
  {
    id: 'geo_003',
    text: '¿En qué continente está ubicado Egipto?',
    category: 'Geografía',
    difficulty: 'easy',
    correctAnswer: 'África',
  },
  {
    id: 'geo_004',
    text: '¿Cuál es la montaña más alta del mundo?',
    category: 'Geografía',
    difficulty: 'easy',
    correctAnswer: 'Monte Everest',
  },
  {
    id: 'geo_005',
    text: '¿Qué país tiene la mayor cantidad de husos horarios?',
    category: 'Geografía',
    difficulty: 'hard',
    correctAnswer: 'Francia',
  },

  // Ciencias
  {
    id: 'sci_001',
    text: '¿Cuál es el elemento químico con símbolo "Au"?',
    category: 'Ciencias',
    difficulty: 'medium',
    correctAnswer: 'Oro',
  },
  {
    id: 'sci_002',
    text: '¿Cuántos huesos tiene un adulto humano promedio?',
    category: 'Ciencias',
    difficulty: 'medium',
    correctAnswer: '206',
  },
  {
    id: 'sci_003',
    text: '¿Qué planeta es conocido como "el planeta rojo"?',
    category: 'Ciencias',
    difficulty: 'easy',
    correctAnswer: 'Marte',
  },
  {
    id: 'sci_004',
    text: '¿Cuál es la velocidad de la luz en el vacío?',
    category: 'Ciencias',
    difficulty: 'hard',
    correctAnswer: '299,792,458 metros por segundo',
  },
  {
    id: 'sci_005',
    text: '¿Quién propuso la teoría de la evolución?',
    category: 'Ciencias',
    difficulty: 'easy',
    correctAnswer: 'Charles Darwin',
  },

  // Deportes
  {
    id: 'dep_001',
    text: '¿En qué año se celebraron los primeros Juegos Olímpicos modernos?',
    category: 'Deportes',
    difficulty: 'medium',
    correctAnswer: '1896',
  },
  {
    id: 'dep_002',
    text: '¿Cuántos jugadores hay en un equipo de fútbol en el campo?',
    category: 'Deportes',
    difficulty: 'easy',
    correctAnswer: '11',
  },
  {
    id: 'dep_003',
    text: '¿Qué tenista tiene más títulos de Grand Slam masculinos?',
    category: 'Deportes',
    difficulty: 'medium',
    correctAnswer: 'Novak Djokovic',
  },
  {
    id: 'dep_004',
    text: '¿En qué deporte se usa un "puck"?',
    category: 'Deportes',
    difficulty: 'easy',
    correctAnswer: 'Hockey sobre hielo',
  },
  {
    id: 'dep_005',
    text: '¿Cuál es la distancia oficial de una maratón?',
    category: 'Deportes',
    difficulty: 'medium',
    correctAnswer: '42.195 kilómetros',
  },

  // Entretenimiento
  {
    id: 'ent_001',
    text: '¿Qué película ganó el Oscar a Mejor Película en 2020?',
    category: 'Entretenimiento',
    difficulty: 'medium',
    correctAnswer: 'Parasite',
  },
  {
    id: 'ent_002',
    text: '¿Cuántas cuerdas tiene una guitarra estándar?',
    category: 'Entretenimiento',
    difficulty: 'easy',
    correctAnswer: '6',
  },
  {
    id: 'ent_003',
    text: '¿Qué superhéroe es conocido como "El Hombre de Acero"?',
    category: 'Entretenimiento',
    difficulty: 'easy',
    correctAnswer: 'Superman',
  },
  {
    id: 'ent_004',
    text: '¿En qué año se estrenó la primera película de Star Wars?',
    category: 'Entretenimiento',
    difficulty: 'medium',
    correctAnswer: '1977',
  },
  {
    id: 'ent_005',
    text: '¿Cuál es el libro más vendido de todos los tiempos (después de la Biblia)?',
    category: 'Entretenimiento',
    difficulty: 'hard',
    correctAnswer: 'Don Quijote de la Mancha',
  },

  // Matemáticas
  {
    id: 'math_001',
    text: '¿Cuál es el valor de Pi con 3 decimales?',
    category: 'Matemáticas',
    difficulty: 'easy',
    correctAnswer: '3.141',
  },
  {
    id: 'math_002',
    text: '¿Cuánto es 15% de 200?',
    category: 'Matemáticas',
    difficulty: 'easy',
    correctAnswer: '30',
  },
  {
    id: 'math_003',
    text: '¿Cuál es la raíz cuadrada de 144?',
    category: 'Matemáticas',
    difficulty: 'easy',
    correctAnswer: '12',
  },
  {
    id: 'math_004',
    text: '¿Cómo se llama un polígono de 8 lados?',
    category: 'Matemáticas',
    difficulty: 'medium',
    correctAnswer: 'Octágono',
  },
  {
    id: 'math_005',
    text: '¿Cuál es la fórmula para calcular el área de un círculo?',
    category: 'Matemáticas',
    difficulty: 'medium',
    correctAnswer: 'π × r²',
  },
];

/**
 * Obtiene una pregunta aleatoria del banco
 */
export function getRandomQuestion(): Question {
  const randomIndex = Math.floor(Math.random() * QUESTION_BANK.length);
  return QUESTION_BANK[randomIndex];
}

/**
 * Obtiene preguntas por categoría
 */
export function getQuestionsByCategory(category: string): Question[] {
  return QUESTION_BANK.filter((q) => q.category === category);
}

/**
 * Obtiene preguntas por dificultad
 */
export function getQuestionsByDifficulty(
  difficulty: 'easy' | 'medium' | 'hard'
): Question[] {
  return QUESTION_BANK.filter((q) => q.difficulty === difficulty);
}

/**
 * Obtiene las categorías disponibles
 */
export function getAvailableCategories(): string[] {
  return [...new Set(QUESTION_BANK.map((q) => q.category))];
}
