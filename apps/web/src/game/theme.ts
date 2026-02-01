/**
 * Board theme system - professional chess.com inspired themes
 */

export interface Theme {
  id: string;
  name: string;
  lightSquare: string;
  darkSquare: string;
  selectedSquare: string;
  legalMoveIndicator: string;
}

const THEMES: Theme[] = [
  {
    id: "classic",
    name: "Classic Green",
    lightSquare: "#eeeed2",
    darkSquare: "#769656",
    selectedSquare: "rgba(186, 202, 68, 0.8)",
    legalMoveIndicator: "rgba(0, 0, 0, 0.15)",
  },
  {
    id: "brown",
    name: "Wood",
    lightSquare: "#f0d9b5",
    darkSquare: "#b58863",
    selectedSquare: "rgba(255, 255, 0, 0.5)",
    legalMoveIndicator: "rgba(0, 0, 0, 0.15)",
  },
  {
    id: "blue",
    name: "Ice Blue",
    lightSquare: "#dee3e6",
    darkSquare: "#8ca2ad",
    selectedSquare: "rgba(82, 176, 220, 0.6)",
    legalMoveIndicator: "rgba(0, 0, 0, 0.15)",
  },
  {
    id: "coral",
    name: "Coral",
    lightSquare: "#f2d7c7",
    darkSquare: "#c27a5c",
    selectedSquare: "rgba(255, 180, 120, 0.7)",
    legalMoveIndicator: "rgba(0, 0, 0, 0.15)",
  },
  {
    id: "purple",
    name: "Amethyst",
    lightSquare: "#e8e0f0",
    darkSquare: "#9070a0",
    selectedSquare: "rgba(180, 130, 220, 0.6)",
    legalMoveIndicator: "rgba(0, 0, 0, 0.15)",
  },
  {
    id: "kaspa",
    name: "Kaspa Teal",
    lightSquare: "#e0f2ef",
    darkSquare: "#4a9e8f",
    selectedSquare: "rgba(73, 234, 203, 0.6)",
    legalMoveIndicator: "rgba(0, 0, 0, 0.15)",
  },
];

/**
 * Get random theme
 */
export function randomTheme(): Theme {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

/**
 * Get theme from seed (deterministic)
 */
export function themeFromSeed(seed: string): Theme {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % THEMES.length;
  return THEMES[index];
}

/**
 * Get theme by ID
 */
export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export { THEMES };
