/* First step: collect name/date, then carry them to the selected product. */
(() => {
  const STORAGE_KEY = 'cw-personalization';
  const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

  function init(root) {
    if (root.dataset.cwInitialized === 'true') return;
    const form = root.querySelector('[data-cw-start-form]');
    const names = root.querySelector('[data-cw-start-names]');
    const date = root.querySelector('[data-cw-start-date]');
    const namesPreview = root.querySelector('[data-cw-start-names-preview]');
    const datePreview = root.querySelector('[data-cw-start-date-preview]');
    const counter = root.querySelector('[data-cw-start-counter]');
    const status = root.querySelector('[data-cw-start-status]');
    if (!form || !names || !date || !namesPreview || !datePreview) return;
    root.dataset.cwInitialized = 'true';

    const render = () => {
      const nameText = clean(names.value);
      const dateText = clean(date.value);
      namesPreview.textContent = nameText || root.dataset.exampleNames || 'Eure Namen';
      datePreview.textContent = dateText || (nameText ? '' : root.dataset.exampleDate || '05.08.2022');
      if (counter) counter.textContent = `${names.value.length} / ${names.maxLength}`;
      if (nameText) names.setCustomValidity('');
    };

    [names, date].forEach((field) => field.addEventListener('input', render));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      names.value = clean(names.value);
      date.value = clean(date.value);
      render();
      if (!names.value) {
        names.setCustomValidity('Bitte gib eure Namen ein.');
        names.reportValidity();
        if (status) status.textContent = 'Bitte gib eure Namen ein.';
        return;
      }
      const productUrl = clean(root.dataset.productUrl);
      if (!productUrl) {
        if (status) status.textContent = 'Das Produkt ist noch nicht eingerichtet.';
        return;
      }
      const personalization = { names: names.value, date: date.value };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(personalization));
      } catch (_error) {
        // Query parameters provide the fallback when storage is unavailable.
      }
      const destination = new URL(productUrl, window.location.origin);
      destination.searchParams.set('cw_names', personalization.names);
      if (personalization.date) destination.searchParams.set('cw_date', personalization.date);
      window.location.assign(destination.toString());
    });
    render();
  }

  function boot(scope = document) {
    scope.querySelectorAll('[data-cw-start]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
  document.addEventListener('shopify:section:load', (event) => boot(event.target));
})();
