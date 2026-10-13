/* Couple Wear personalization studio: live preview + native Shopify cart form. */
(() => {
  const STORAGE_KEY = 'cw-personalization';
  const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

  function init(root) {
    if (root.dataset.cwInitialized === 'true') return;

    const form = root.querySelector('.cw-studio__form');
    const names = root.querySelector('[data-cw-names]');
    const date = root.querySelector('[data-cw-date]');
    const namesPreview = root.querySelector('[data-cw-names-preview]');
    const datePreview = root.querySelector('[data-cw-date-preview]');
    const counter = root.querySelector('[data-cw-counter]');
    const summary = root.querySelector('[data-cw-summary]');
    const status = root.querySelector('[data-cw-status]');
    const variantSelect = root.querySelector('[data-cw-variant-select]');
    const productImage = root.querySelector('[data-cw-product-image]');
    const price = root.querySelector('[data-cw-price]');
    const submit = root.querySelector('[data-cw-submit]');
    const submitLabel = root.querySelector('[data-cw-submit-label]');

    if (!form || !names || !date || !namesPreview || !datePreview) return;
    root.dataset.cwInitialized = 'true';

    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      let stored = {};
      try {
        stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      } catch (_error) {
        stored = {};
      }
      names.value = clean(params.get('cw_names') || stored.names || '');
      date.value = clean(params.get('cw_date') || stored.date || '');
    };

    const render = () => {
      const nameText = clean(names.value);
      const dateText = clean(date.value);
      namesPreview.textContent = nameText || root.dataset.exampleNames || 'Eure Namen';
      datePreview.textContent = dateText || (nameText ? '' : root.dataset.exampleDate || '05.08.2022');
      if (counter) counter.textContent = `${names.value.length} / ${names.maxLength}`;
      if (summary) summary.value = dateText ? `${nameText} · ${dateText}` : nameText;
      if (nameText) names.setCustomValidity('');
      if (status) status.textContent = '';
    };

    const renderVariant = () => {
      if (!variantSelect) return;
      const option = variantSelect.selectedOptions[0];
      if (!option) return;
      const available = option.dataset.available === 'true';
      if (price && option.dataset.price) price.textContent = option.dataset.price;
      if (productImage && option.dataset.image) {
        productImage.src = option.dataset.image;
        productImage.removeAttribute('srcset');
      }
      if (submit) submit.disabled = !available;
      if (submitLabel && submit) {
        submitLabel.textContent = available ? submit.dataset.addText : submit.dataset.soldoutText;
      }
    };

    names.addEventListener('input', render);
    date.addEventListener('input', render);
    if (variantSelect) variantSelect.addEventListener('change', renderVariant);

    form.addEventListener('submit', (event) => {
      names.value = clean(names.value);
      date.value = clean(date.value);
      render();

      if (!names.value) {
        event.preventDefault();
        names.setCustomValidity('Bitte gib eure Namen ein.');
        names.reportValidity();
        if (status) status.textContent = 'Bitte gib eure Namen ein.';
        return;
      }

      if (variantSelect && variantSelect.selectedOptions[0]?.dataset.available !== 'true') {
        event.preventDefault();
        if (status) status.textContent = 'Bitte wähle eine verfügbare Variante.';
        return;
      }

      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ names: names.value, date: date.value }));
      } catch (_error) {
        // The Shopify line-item properties remain the source of truth.
      }
      if (submit) submit.classList.add('is-loading');
      if (submitLabel) submitLabel.textContent = 'Wird hinzugefügt …';
    });

    restore();
    render();
    renderVariant();
  }

  function boot(scope = document) {
    scope.querySelectorAll('[data-cw-studio]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
  document.addEventListener('shopify:section:load', (event) => boot(event.target));
})();
