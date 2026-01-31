// Deterministic theme generation from seed
function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslFrom(seed: string, offset: number): string {
  const h = (hash32(seed + ":" + offset) % 360);
  const s = 70;
  const l = 45;
  return `hsl(${h} ${s}% ${l}%)`;
}

export type Theme = {
  light: string;
  dark: string;
  accent: string;
};

export function themeFromSeed(seed: string): Theme {
  return {
    light: hslFrom(seed, 1),
    dark: hslFrom(seed, 2),
    accent: hslFrom(seed, 3),
  };
}

export function randomTheme(): Theme {
  const seed = Math.random().toString(36).slice(2, 10);
  return themeFromSeed(seed);
}
