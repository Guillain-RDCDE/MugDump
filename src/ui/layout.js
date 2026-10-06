// ── Panel resize (drag handle between grid and detail panel) ─────────────────

// ── Sidebar overlay toggle (tablet ≤1024px) ──────────────────────────────────

export function setupSidebarToggle() {
  const toggleBtn = document.getElementById('btn-sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  const app = document.getElementById('app');
  if (!toggleBtn || !backdrop || !app) return;

  const open = () => {
    app.classList.add('sidebar-open');
    toggleBtn.textContent = '‹';
    toggleBtn.title = 'Close editing panel';
  };
  const close = () => {
    app.classList.remove('sidebar-open');
    toggleBtn.textContent = '›';
    toggleBtn.title = 'Show editing panel';
  };

  toggleBtn.addEventListener('click', () => {
    app.classList.contains('sidebar-open') ? close() : open();
  });
  backdrop.addEventListener('click', close);

  // Auto-close when viewport expands back to desktop size
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) close();
  });
}

/** Sidebar collapse/expand tab — visible at desktop, hidden at tablet (overlay uses #btn-sidebar-toggle). */
export function setupSidebarCollapse() {
  const btn = document.getElementById('sidebar-collapse-btn');
  const panel = document.getElementById('detail-panel');
  const handle = document.getElementById('panel-resize-handle');
  const app = document.getElementById('app');
  if (!btn || !panel || !app) return;

  const STORED_KEY = 'gbcam_sidebar_collapsed';

  const isDesktop = () => window.innerWidth > 1024;

  function doCollapse(save = true) {
    // Clear any inline width set by drag-resize so the CSS class rule can take effect
    panel.style.width = '';
    panel.style.flex = '';
    app.classList.add('sidebar-collapsed');
    btn.textContent = '›';
    btn.title = 'Expand sidebar';
    if (handle) handle.style.cursor = 'default';
    if (save) localStorage.setItem(STORED_KEY, '1');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
  }
  function doExpand(save = true) {
    // Clear any inline width so the panel returns to its CSS-defined width
    panel.style.width = '';
    panel.style.flex = '';
    app.classList.remove('sidebar-collapsed');
    btn.textContent = '‹';
    btn.title = 'Collapse sidebar';
    if (handle) handle.style.cursor = '';
    if (save) localStorage.setItem(STORED_KEY, '0');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
  }

  // Restore persisted state (only at desktop — tablet overlay ignores this)
  if (isDesktop() && localStorage.getItem(STORED_KEY) === '1') doCollapse(false);

  // When crossing the 1024px breakpoint, sync the collapsed class appropriately
  let _wasDesktop = isDesktop();
  window.addEventListener('resize', () => {
    const nowDesktop = isDesktop();
    if (nowDesktop === _wasDesktop) return;
    _wasDesktop = nowDesktop;
    if (!nowDesktop) {
      // Going tablet: remove sidebar-collapsed so overlay system isn't blocked
      app.classList.remove('sidebar-collapsed');
    } else {
      // Going desktop: restore from storage
      if (localStorage.getItem(STORED_KEY) === '1') doCollapse(false);
    }
  });

  // Stop the mousedown on the button from triggering a resize drag
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  btn.addEventListener('click', () => {
    app.classList.contains('sidebar-collapsed') ? doExpand() : doCollapse();
  });
}

export function setupPanelResize() {
  const handle = document.getElementById('panel-resize-handle');
  const detailPanel = document.getElementById('detail-panel');
  if (!handle || !detailPanel) return;

  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = detailPanel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const dx = startX - e.clientX; // dragging left = panel wider
      const newWidth = Math.max(260, Math.min(600, startWidth + dx));
      detailPanel.style.width = `${newWidth}px`;
      detailPanel.style.flex = 'none';
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}
