/* Couple Wear text personalization inside Horizon's native product form. */
(() => {
  const STORAGE_KEY = 'cw-personalization';
  const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

  function getStartingValues() {
    const params = new URLSearchParams(window.location.search);
    let stored = {};
    try {
      stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_error) {
      stored = {};
    }
    return {
      names: clean(params.get('cw_names') || stored.names),
      date: clean(params.get('cw_date') || stored.date),
    };
  }

  function init(root) {
    if (root.dataset.cwInitialized === 'true') return;
    const form = root.closest('form');
    const names = root.querySelector('[data-cw-names-input]');
    const date = root.querySelector('[data-cw-date-input]');
    const namesPreview = root.querySelector('[data-cw-names-preview]');
    const datePreview = root.querySelector('[data-cw-date-preview]');
    const summary = root.querySelector('[data-cw-summary-input]');
    const counter = root.querySelector('[data-cw-counter]');
    const status = root.querySelector('[data-cw-status]');
    if (!form || !names || !date || !namesPreview || !datePreview || !summary) return;
    root.dataset.cwInitialized = 'true';

    const startingValues = getStartingValues();
    if (!names.value && startingValues.names) names.value = startingValues.names;
    if (!date.value && startingValues.date) date.value = startingValues.date;

    const render = () => {
      const nameText = clean(names.value);
      const dateText = clean(date.value);
      namesPreview.textContent = nameText || root.dataset.cwInitialNames || 'Eure Namen';
      datePreview.textContent = dateText || (nameText ? '' : root.dataset.cwInitialDate || '05.08.2022');
      summary.value = dateText ? `${nameText} · ${dateText}` : nameText;
      if (counter) counter.textContent = `${names.value.length} / ${names.maxLength}`;
      if (nameText) names.setCustomValidity('');
    };

    [names, date].forEach((field) => field.addEventListener('input', render));
    form.addEventListener('submit', (event) => {
      names.value = clean(names.value);
      date.value = clean(date.value);
      render();
      if (!names.value) {
        event.preventDefault();
        event.stopImmediatePropagation();
        names.setCustomValidity('Bitte gib eure Namen ein.');
        names.reportValidity();
        if (status) status.textContent = 'Bitte gib eure Namen ein.';
        return;
      }
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (_error) {
        // Storage is optional; the Shopify line-item properties remain authoritative.
      }
      if (status) status.textContent = 'Die Personalisierung wird mit der Bestellung übermittelt.';
    }, { capture: true });
    render();
  }

  function boot(scope = document) {
    scope.querySelectorAll('[data-cw-personalizer]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
  document.addEventListener('shopify:section:load', (event) => boot(event.target));
})();
