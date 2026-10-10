import { DEFAULT_CONFIG, FINISHES, THEMES, type ProductConfig } from '../config/presets';

export const STORAGE_KEY = 'lumen65.product.config.v1';

const validFinish = (id: unknown) => FINISHES.some((f) => f.id === id);
const validTheme = (id: unknown) => THEMES.some((t) => t.id === id);

/** reads this page's own configuration; anything malformed falls back to defaults */
export function loadConfig(): ProductConfig {
  const fallback: ProductConfig = { ...DEFAULT_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ProductConfig>;
    return {
      finishId: validFinish(parsed.finishId) ? (parsed.finishId as string) : fallback.finishId,
      spaceText:
        typeof parsed.spaceText === 'string' ? parsed.spaceText.slice(0, 12) : fallback.spaceText,
      themeId: validTheme(parsed.themeId) ? (parsed.themeId as string) : fallback.themeId,
      exploded: typeof parsed.exploded === 'boolean' ? parsed.exploded : fallback.exploded,
      typingMode: typeof parsed.typingMode === 'boolean' ? parsed.typingMode : fallback.typingMode,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : fallback.sound,
    };
  } catch {
    return fallback;
  }
}

export function saveConfig(config: ProductConfig): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

/** only ever removes this page's own key */
export function clearConfig(): boolean {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
