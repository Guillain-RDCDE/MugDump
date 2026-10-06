/** Light / dark theme toggle, remembered in localStorage. */
export function setupTheme() {
  const THEME_KEY = 'mugdump:theme';
  const themeToggleBtn = document.getElementById('theme-toggle');
  function applyTheme(theme) {
    const light = theme === 'light';
    document.documentElement.classList.toggle('theme-light', light);
    if (themeToggleBtn) {
      themeToggleBtn.textContent = light ? '☀️' : '🌙';
      themeToggleBtn.title = light ? 'Switch to dark theme' : 'Switch to light theme';
    }
  }
  applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
  themeToggleBtn?.addEventListener('click', () => {
    const nowLight = !document.documentElement.classList.contains('theme-light');
    applyTheme(nowLight ? 'light' : 'dark');
    localStorage.setItem(THEME_KEY, nowLight ? 'light' : 'dark');
  });
}
