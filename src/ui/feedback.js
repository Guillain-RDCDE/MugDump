import { dom } from './dom.js';

// ── Toast ───────────────────────────────────────────────────────────────────

let toastTimer;

export function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('visible'), 2500);
}

// ── Status bar ─────────────────────────────────────────────────────────────

export function setStatus(text, active = false) {
  dom.statusText.textContent = text;
  dom.statusDot.className = 'status-dot' + (active ? ' green' : '');
}
