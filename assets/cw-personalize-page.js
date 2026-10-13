/* Couple Wear AI Studio: private upload hand-off, live preview and Shopify cart properties. */
(() => {
  const STORAGE_KEY = 'cw-personalization-v2';
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const STYLE_LABELS = {
    minimal: 'Minimal Line Art',
    heart: 'Romantic Heart',
    embrace: 'Loving Embrace',
    hands: 'Hands of Love',
  };

  const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const query = (root, selector) => root.querySelector(selector);
  const queryAll = (root, selector) => Array.from(root.querySelectorAll(selector));

  function init(root) {
    if (root.dataset.cwInitialized === 'true') return;

    const form = query(root, '.cw-studio__form');
    if (!form) return;
    root.dataset.cwInitialized = 'true';

    const elements = {
      dropzone: query(root, '[data-cw-dropzone]'),
      fileInput: query(root, '[data-cw-file-input]'),
      consent: query(root, '[data-cw-consent]'),
      originalPreview: query(root, '[data-cw-original-preview]'),
      styles: queryAll(root, '[data-cw-style]'),
      generate: query(root, '[data-cw-generate]'),
      generateLabel: query(root, '[data-cw-generate-label]'),
      generationProgress: query(root, '[data-cw-generation-progress]'),
      progressBar: query(root, '[data-cw-progress-bar]'),
      generationMessage: query(root, '[data-cw-generation-message]'),
      result: query(root, '[data-cw-result]'),
      resultBefore: query(root, '[data-cw-result-before]'),
      resultAfter: query(root, '[data-cw-result-after]'),
      regenerate: query(root, '[data-cw-regenerate]'),
      designImage: query(root, '[data-cw-design-image]'),
      designId: query(root, '[data-cw-design-id]'),
      styleProperty: query(root, '[data-cw-style-property]'),
      productionStatus: query(root, '[data-cw-production-status]'),
      nameOne: query(root, '[data-cw-name-one]'),
      nameTwo: query(root, '[data-cw-name-two]'),
      date: query(root, '[data-cw-date]'),
      extra: query(root, '[data-cw-extra]'),
      font: query(root, '[data-cw-font]'),
      namesPreview: query(root, '[data-cw-names-preview]'),
      datePreview: query(root, '[data-cw-date-preview]'),
      extraPreview: query(root, '[data-cw-extra-preview]'),
      namesProperty: query(root, '[data-cw-names-property]'),
      summary: query(root, '[data-cw-summary]'),
      counter: query(root, '[data-cw-counter]'),
      productChoices: queryAll(root, '[data-cw-product-choice]'),
      variantSelect: query(root, '[data-cw-variant-select]'),
      productImage: query(root, '[data-cw-product-image]'),
      productTitle: query(root, '[data-cw-product-title]'),
      price: query(root, '[data-cw-price]'),
      placement: query(root, '[data-cw-placement]'),
      submit: query(root, '[data-cw-submit]'),
      submitLabel: query(root, '[data-cw-submit-label]'),
      status: query(root, '[data-cw-status]'),
      progressItems: queryAll(root, '[data-cw-progress]'),
    };

    const state = {
      file: null,
      objectUrl: '',
      designReady: false,
      generating: false,
      activeProduct: elements.productChoices[0]?.dataset.cwProductChoice || 'fallback',
      attempts: 0,
    };

    const apiEndpoint = clean(root.dataset.apiEndpoint).replace(/\/$/, '');
    const demoMode = !apiEndpoint || root.dataset.demoMode === 'true';

    function setStatus(message, type = '') {
      if (!elements.status) return;
      elements.status.textContent = message;
      elements.status.dataset.type = type;
    }

    function setStep(step) {
      elements.progressItems.forEach((item) => {
        const number = Number(item.dataset.cwProgress);
        item.classList.toggle('is-active', number === step);
        item.classList.toggle('is-complete', number < step);
      });
    }

    function currentStyle() {
      return elements.styles.find((input) => input.checked) || elements.styles[0];
    }

    function renderText() {
      const nameOne = clean(elements.nameOne?.value);
      const nameTwo = clean(elements.nameTwo?.value);
      const names = [nameOne, nameTwo].filter(Boolean).join(' & ');
      const date = clean(elements.date?.value);
      const extra = clean(elements.extra?.value);

      elements.namesPreview.textContent = names || root.dataset.exampleNames || 'Eure Namen';
      elements.datePreview.textContent = date || (!names ? root.dataset.exampleDate || '05.08.2022' : '');
      elements.extraPreview.textContent = extra;
      elements.namesPreview.dataset.font = elements.font?.value || 'signature';
      elements.namesProperty.value = names;
      elements.summary.value = [names, date, extra].filter(Boolean).join(' · ');
      if (elements.counter) elements.counter.textContent = `${nameOne.length + nameTwo.length + extra.length} / 64`;
      if (nameOne) elements.nameOne.setCustomValidity('');
      if (nameTwo) elements.nameTwo.setCustomValidity('');

      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ nameOne, nameTwo, date, extra, font: elements.font?.value || 'signature' }));
      } catch (_error) {
        // Text persistence is optional. Photos are deliberately never stored in browser storage.
      }
    }

    function restoreText() {
      let stored = {};
      try {
        stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      } catch (_error) {
        stored = {};
      }
      if (elements.nameOne) elements.nameOne.value = clean(stored.nameOne);
      if (elements.nameTwo) elements.nameTwo.value = clean(stored.nameTwo);
      if (elements.date) elements.date.value = clean(stored.date);
      if (elements.extra) elements.extra.value = clean(stored.extra);
      if (elements.font && stored.font) elements.font.value = stored.font;
    }

    function setSelectedStyle(input, advance = true) {
      elements.styles.forEach((item) => item.closest('.cw-studio__style')?.classList.toggle('is-selected', item === input));
      elements.styleProperty.value = STYLE_LABELS[input.value] || input.value;
      if (!state.designReady && input.dataset.previewUrl) elements.designImage.src = input.dataset.previewUrl;
      if (advance) setStep(3);
    }

    function resetGeneratedDesign() {
      state.designReady = false;
      elements.designId.value = '';
      elements.result.hidden = true;
      elements.productionStatus.value = 'Manuelle Druckfreigabe erforderlich';
    }

    function useFile(file) {
      if (!file) return;
      if (!ALLOWED_TYPES.has(file.type)) {
        setStatus('Bitte wähle ein JPG-, PNG- oder WebP-Bild.', 'error');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setStatus('Das Bild ist größer als 10 MB. Bitte wähle eine kleinere Datei.', 'error');
        return;
      }

      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = URL.createObjectURL(file);
      state.file = file;
      resetGeneratedDesign();
      elements.originalPreview.src = state.objectUrl;
      elements.originalPreview.hidden = false;
      elements.dropzone.classList.add('has-file');
      if (elements.resultBefore) elements.resultBefore.src = state.objectUrl;
      setStatus('Foto ausgewählt. Wähle jetzt euren Designstil.', 'success');
      setStep(2);
    }

    function setGenerating(active) {
      state.generating = active;
      elements.generate.disabled = active;
      elements.generateLabel.textContent = active ? 'Design wird erstellt …' : state.designReady ? 'Design neu erstellen' : 'Mein Design erstellen';
      elements.generationProgress.hidden = !active;
      if (!active) elements.progressBar.style.width = '0%';
    }

    async function animateProgress() {
      const messages = [
        ['Foto wird sicher in hoher Auflösung vorbereitet …', '18%'],
        ['Gesichtsform und markante Merkmale werden erhalten …', '42%'],
        ['Pose, Haare und Proportionen werden übertragen …', '68%'],
        ['Fine-Line-Design wird in Druckqualität verfeinert …', '86%'],
      ];
      for (const [message, width] of messages) {
        elements.generationMessage.textContent = message;
        elements.progressBar.style.width = width;
        await new Promise((resolve) => window.setTimeout(resolve, demoMode ? 220 : 650));
      }
    }

    async function requestDesign() {
      if (state.generating) return;
      if (!state.file) {
        setStatus('Bitte lade zuerst ein Foto hoch.', 'error');
        elements.fileInput.focus();
        setStep(1);
        return;
      }
      if (!elements.consent.checked) {
        setStatus('Bitte bestätige die Einwilligung zur Bildverarbeitung.', 'error');
        elements.consent.focus();
        setStep(1);
        return;
      }

      const style = currentStyle();
      setStatus('');
      setGenerating(true);
      state.attempts += 1;

      try {
        const animation = animateProgress();
        let result;
        if (demoMode) {
          await animation;
          result = {
            designId: `demo_${Date.now()}_${state.attempts}`,
            previewUrl: style.dataset.previewUrl,
            productionReady: false,
          };
        } else {
          const payload = new FormData();
          payload.append('photo', state.file, state.file.name);
          payload.append('style', style.value);
          payload.append('consent', 'true');
          payload.append('attempt', String(state.attempts));

          const response = await fetch(`${apiEndpoint}/api/v1/designs`, { method: 'POST', body: payload, credentials: 'omit' });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.message || 'Das Design konnte nicht erstellt werden.');
          await animation;
          result = body;
        }

        if (!result?.designId || !result?.previewUrl) throw new Error('Die Design-Antwort ist unvollständig.');
        state.designReady = true;
        elements.designId.value = result.designId;
        elements.productionStatus.value = result.productionReady ? 'Druckdatei technisch geprüft – manuelle Freigabe erforderlich' : 'Manuelle Druckfreigabe erforderlich';
        elements.designImage.src = result.previewUrl;
        elements.resultAfter.src = result.previewUrl;
        elements.result.hidden = false;
        elements.progressBar.style.width = '100%';
        const localContour = result.mode === 'local-contour';
        setStatus(
          demoMode
            ? 'Demo-Design erstellt. Für die echte Foto-Umwandlung ist die Backend-Verbindung erforderlich.'
            : localContour
              ? 'Originalgetreue Kontur erstellt. Mit einem serverseitigen KI-Schlüssel wird das Ergebnis noch eleganter und detailreicher.'
              : 'Euer hochauflösendes KI-Design ist bereit. Bitte prüft, ob beide Personen gut wiederzuerkennen sind.',
          'success',
        );
        setStep(4);
      } catch (error) {
        resetGeneratedDesign();
        setStatus(error instanceof Error ? error.message : 'Das Design konnte nicht erstellt werden.', 'error');
      } finally {
        setGenerating(false);
      }
    }

    function renderVariant() {
      const option = elements.variantSelect?.selectedOptions[0];
      if (!option) return;
      const available = option.dataset.available === 'true';
      if (elements.price && option.dataset.price) elements.price.textContent = option.dataset.price;
      if (elements.productImage && option.dataset.image) {
        elements.productImage.src = option.dataset.image;
        elements.productImage.removeAttribute('srcset');
      }
      elements.submit.disabled = !available;
      elements.submitLabel.textContent = available ? elements.submit.dataset.addText : elements.submit.dataset.soldoutText;
    }

    function selectProduct(button, advance = true) {
      state.activeProduct = button.dataset.cwProductChoice;
      elements.productChoices.forEach((choice) => choice.classList.toggle('is-selected', choice === button));
      if (elements.productTitle) elements.productTitle.textContent = button.dataset.productTitle || button.textContent.trim();
      if (elements.productImage && button.dataset.productImage) elements.productImage.src = button.dataset.productImage;

      const options = Array.from(elements.variantSelect.options);
      options.forEach((option) => {
        const matches = option.dataset.productType === state.activeProduct;
        option.hidden = !matches;
        option.disabled = !matches;
      });
      const firstAvailable = options.find((option) => !option.disabled && option.dataset.available === 'true') || options.find((option) => !option.disabled);
      if (firstAvailable) elements.variantSelect.value = firstAvailable.value;
      renderVariant();
      if (advance) setStep(5);
    }

    elements.fileInput.addEventListener('change', () => useFile(elements.fileInput.files?.[0]));
    ['dragenter', 'dragover'].forEach((eventName) => elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((eventName) => elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove('is-dragging');
    }));
    elements.dropzone.addEventListener('drop', (event) => useFile(event.dataTransfer?.files?.[0]));
    elements.styles.forEach((input) => input.addEventListener('change', () => {
      resetGeneratedDesign();
      setSelectedStyle(input);
    }));
    [elements.nameOne, elements.nameTwo, elements.date, elements.extra, elements.font].filter(Boolean).forEach((field) => field.addEventListener('input', renderText));
    elements.generate.addEventListener('click', requestDesign);
    elements.regenerate?.addEventListener('click', requestDesign);
    elements.variantSelect?.addEventListener('change', renderVariant);
    elements.productChoices.forEach((button) => button.addEventListener('click', () => selectProduct(button)));
    elements.placement?.addEventListener('change', () => root.classList.toggle('is-back-print', elements.placement.value === 'back'));

    form.addEventListener('submit', (event) => {
      renderText();
      const missingName = !clean(elements.nameOne.value) ? elements.nameOne : !clean(elements.nameTwo.value) ? elements.nameTwo : null;
      if (missingName) {
        event.preventDefault();
        missingName.setCustomValidity('Bitte gib beide Namen ein.');
        missingName.reportValidity();
        setStatus('Bitte gib beide Namen ein.', 'error');
        setStep(4);
        return;
      }
      if (!state.designReady) {
        event.preventDefault();
        setStatus('Bitte erstelle und prüfe zuerst euer Design.', 'error');
        setStep(3);
        return;
      }
      if (elements.variantSelect?.selectedOptions[0]?.dataset.available !== 'true') {
        event.preventDefault();
        setStatus('Bitte wähle eine verfügbare Variante.', 'error');
        return;
      }
      elements.submit.classList.add('is-loading');
      elements.submitLabel.textContent = 'Wird hinzugefügt …';
    });

    window.addEventListener('pagehide', () => {
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    }, { once: true });

    restoreText();
    renderText();
    setSelectedStyle(currentStyle(), false);
    if (elements.productChoices[0]) selectProduct(elements.productChoices[0], false);
    setStep(1);
  }

  function boot(scope = document) {
    scope.querySelectorAll('[data-cw-studio]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
  document.addEventListener('shopify:section:load', (event) => boot(event.target));
})();
