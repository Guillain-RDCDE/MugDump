import { STORAGE_KEYS, readString, writeString } from '../app/storage.js';
/** Light / dark theme toggle, remembered in localStorage. */
export function setupTheme() {
  const themeToggleBtn = document.getElementById('theme-toggle');
  function applyTheme(theme) {
    const light = theme === 'light';
    document.documentElement.classList.toggle('theme-light', light);
    if (themeToggleBtn) {
      themeToggleBtn.textContent = light ? '☀️' : '🌙';
      themeToggleBtn.title = light ? 'Switch to dark theme' : 'Switch to light theme';
    }
  }
  applyTheme(readString(STORAGE_KEYS.theme) === 'light' ? 'light' : 'dark');
  themeToggleBtn?.addEventListener('click', () => {
    const nowLight = !document.documentElement.classList.contains('theme-light');
    applyTheme(nowLight ? 'light' : 'dark');
    writeString(STORAGE_KEYS.theme, nowLight ? 'light' : 'dark');
  });
}
