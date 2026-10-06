// ── Collapsible sidebar sections ──────────────────────────────────────────────

export function setupCollapsibleSections() {
  const STORAGE_KEY = 'mugdump:section-states'; // object map of sectionId → isCollapsed
  let sectionStates = {};
  try {
    sectionStates = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (_) {}

  function saveState(sectionId, isCollapsed) {
    sectionStates[sectionId] = isCollapsed;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sectionStates));
    } catch (_) {}
  }

  document.querySelectorAll('#export-controls .ctrl-group.collapsible').forEach((group) => {
    // Find the header: .tone-header, .ctrl-header-row, or a direct .ctrl-label child
    const clickTarget =
      group.querySelector(':scope > .tone-header') ||
      group.querySelector(':scope > .ctrl-header-row') ||
      group.querySelector(':scope > .ctrl-label');
    if (!clickTarget) return;

    const labelEl = clickTarget.classList.contains('ctrl-label')
      ? clickTarget
      : clickTarget.querySelector('.section-label, .ctrl-label');
    const sectionId = labelEl ? labelEl.textContent.trim() : group.id || 'section';
    group.dataset.sectionId = sectionId;

    // Inject chevron before the label text
    if (labelEl) {
      const chevron = document.createElement('span');
      chevron.className = 'section-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '▾';
      labelEl.prepend(chevron);
    }

    // Wrap all siblings after the header into a collapsible body
    const allChildren = [...group.children];
    const headerIdx = allChildren.indexOf(clickTarget);
    const bodyChildren = allChildren.slice(headerIdx + 1);
    if (bodyChildren.length === 0) return;

    const outer = document.createElement('div');
    outer.className = 'section-body-outer';
    const inner = document.createElement('div');
    inner.className = 'section-body-inner';
    bodyChildren.forEach((c) => inner.appendChild(c));
    outer.appendChild(inner);
    group.appendChild(outer);

    // Use saved state if available; otherwise use data-default-collapsed attribute
    const defaultCollapsed = group.getAttribute('data-default-collapsed') === 'true';
    const isCollapsed = sectionId in sectionStates ? sectionStates[sectionId] : defaultCollapsed;
    if (isCollapsed) group.classList.add('collapsed');

    // Toggle on click — ignore clicks on buttons and checkboxes inside the header
    clickTarget.style.cursor = 'pointer';
    clickTarget.addEventListener('click', (e) => {
      if (e.target.closest('button, input, .section-check-wrap')) return;
      if (
        e.target !== clickTarget &&
        e.target !== labelEl &&
        !e.target.classList.contains('section-chevron')
      )
        return;
      const nowCollapsed = group.classList.toggle('collapsed');
      saveState(sectionId, nowCollapsed);
    });
  });
}
