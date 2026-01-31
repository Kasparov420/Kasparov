/**
 * Board theme system - random themes until game starts
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
    id: "blue",
    name: "Blue",
    lightSquare: "#DEE3E6",
    darkSquare: "#8CA2AD",
    selectedSquare: "#F6F669",
    legalMoveIndicator: "rgba(0, 255, 0, 0.4)",
  },
  {
    id: "green",
    name: "Green",
    lightSquare: "#FFFFDD",
    darkSquare: "#86A666",
    selectedSquare: "#F6F669",
    legalMoveIndicator: "rgba(0, 255, 0, 0.4)",
  },
  {
    id: "brown",
    name: "Brown",
    lightSquare: "#F0D9B5",
    darkSquare: "#B58863",
    selectedSquare: "#F6F669",
    legalMoveIndicator: "rgba(0, 255, 0, 0.4)",
  },
  {
    id: "purple",
    name: "Purple",
    lightSquare: "#E8E9F0",
    darkSquare: "#9F90B0",
    selectedSquare: "#F6F669",
    legalMoveIndicator: "rgba(0, 255, 0, 0.4)",
  },
  {
    id: "olive",
    name: "Olive",
    lightSquare: "#E8E9B0",
    darkSquare: "#A8A65A",
    selectedSquare: "#F6F669",
    legalMoveIndicator: "rgba(0, 255, 0, 0.4)",
  },
  {
    id: "coral",
    name: "Coral",
    lightSquare: "#FFE4E1",
    darkSquare: "#CD8C95",
    selectedSquare: "#F6F669",
    legalMoveIndicator: "rgba(0, 255, 0, 0.4)",
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
