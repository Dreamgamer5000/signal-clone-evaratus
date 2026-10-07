export type ThemeSetting = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): Theme {
  if (setting === 'dark') return 'dark';
  if (setting === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
