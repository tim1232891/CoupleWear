/* Couple Wear AI Studio
 * Progressive enhancement for Horizon's native product form. The local renderer is
 * intentionally a preview fallback: connected stores should use the app-proxy API
 * to create and retain the approved production file. */
(() => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_RENDER_SIDE = 1400;
  const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

  const isImageFile = (file) => file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function setFile(input, file) {
    if (!input || !file || typeof DataTransfer === 'undefined') return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      return true;
    } catch (_error) {
      return false;
    }
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Das Foto konnte nicht gelesen werden.'));
      };
      image.src = url;
    });
  }

  function styleSettings(style) {
    if (style === 'Detailed') return { threshold: 52, opacity: 220, spread: 1.25 };
    if (style === 'Romantic') return { threshold: 74, opacity: 205, spread: 1.05 };
    return { threshold: 68, opacity: 198, spread: 0.92 };
  }

  async function renderLineArt(file, style) {
    const image = await readImage(file);
    const sourceLongestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, MAX_RENDER_SIDE / sourceLongestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    canvas.width = width;
    canvas.height = height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    const outputContext = canvas.getContext('2d');
    if (!sourceContext || !outputContext) throw new Error('Der Browser unterstützt keine Bildverarbeitung.');

    sourceContext.drawImage(image, 0, 0, width, height);
    const sourcePixels = sourceContext.getImageData(0, 0, width, height);
    const outputPixels = outputContext.createImageData(width, height);
    const grey = new Float32Array(width * height);
    const settings = styleSettings(style);

    for (let index = 0; index < grey.length; index += 1) {
      const pixel = index * 4;
      grey[index] = sourcePixels.data[pixel] * 0.2126 + sourcePixels.data[pixel + 1] * 0.7152 + sourcePixels.data[pixel + 2] * 0.0722;
    }

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pos = y * width + x;
        const topLeft = grey[pos - width - 1];
        const top = grey[pos - width];
        const topRight = grey[pos - width + 1];
        const left = grey[pos - 1];
        const right = grey[pos + 1];
        const bottomLeft = grey[pos + width - 1];
        const bottom = grey[pos + width];
        const bottomRight = grey[pos + width + 1];
        const gx = -topLeft + topRight - (2 * left) + (2 * right) - bottomLeft + bottomRight;
        const gy = topLeft + (2 * top) + topRight - bottomLeft - (2 * bottom) - bottomRight;
        const edge = Math.sqrt((gx * gx) + (gy * gy)) * settings.spread;
        if (edge < settings.threshold) continue;

        const target = pos * 4;
        const fade = Math.min(1, (edge - settings.threshold) / 105);
        outputPixels.data[target] = 29;
        outputPixels.data[target + 1] = 38;
        outputPixels.data[target + 2] = 37;
        outputPixels.data[target + 3] = Math.round(Math.min(255, settings.opacity * (0.58 + fade * 0.42)));
      }
    }

    outputContext.putImageData(outputPixels, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Die Linienzeichnung konnte nicht exportiert werden.');
    return { canvas, previewUrl: canvas.toDataURL('image/png'), width, height };
  }

  async function renderProductionDraft(lineArt, names, year, font) {
    const textHeight = Math.max(180, Math.round(lineArt.height * 0.22));
    const canvas = document.createElement('canvas');
    canvas.width = lineArt.width;
    canvas.height = lineArt.height + textHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Die Druckdatei konnte nicht vorbereitet werden.');

    context.drawImage(lineArt.canvas, 0, 0);
    context.fillStyle = '#1d2625';
    context.textAlign = 'center';
    const fontFamily = font === 'Elegant' ? 'Georgia, serif' : font === 'Modern' ? 'Arial, sans-serif' : 'cursive';
    context.font = `${font === 'Modern' ? 500 : 400} ${Math.max(38, Math.round(lineArt.width * 0.06))}px ${fontFamily}`;
    const designName = clean(names) || 'Eure Namen';
    context.fillText(designName, lineArt.width / 2, lineArt.height + Math.round(textHeight * 0.48), lineArt.width * 0.92);
    if (clean(year)) {
      context.font = `${Math.max(20, Math.round(lineArt.width * 0.024))}px Georgia, serif`;
      context.fillText(clean(year).split('').join(' '), lineArt.width / 2, lineArt.height + Math.round(textHeight * 0.77));
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Die Druckdatei konnte nicht exportiert werden.');
    return blob;
  }

  function updatePreview(root) {
    const names = root.querySelector('[data-cw-names-input]');
    const year = root.querySelector('[data-cw-year-input]');
    const font = root.querySelector('[data-cw-font-input]');
    const namesPreview = root.querySelector('[data-cw-names-preview]');
    const yearPreview = root.querySelector('[data-cw-year-preview]');
    const counter = root.querySelector('[data-cw-counter]');
    const selectedStyle = root.querySelector('[data-cw-style-input]:checked');
    const name = clean(names?.value);
    const yearText = clean(year?.value);

    setText(namesPreview, name || root.dataset.cwInitialNames || 'Eure Namen');
    setText(yearPreview, yearText || (name ? '' : root.dataset.cwInitialYear || '2022'));
    if (counter && names) counter.textContent = `${names.value.length} / ${names.maxLength}`;
    root.dataset.cwFont = font?.value || 'Signatur';
    root.dataset.cwStyle = selectedStyle?.value || 'Fine Line';
    root.querySelectorAll('[data-cw-style-input]').forEach((input) => {
      input.closest('.cw-personalizer__style-card')?.classList.toggle('is-selected', input.checked);
    });
  }

  function updateProgress(root, step) {
    const order = ['upload', 'design', 'personalize', 'ready'];
    const activeIndex = order.indexOf(step);
    root.querySelectorAll('[data-cw-progress]').forEach((item) => {
      const index = order.indexOf(item.dataset.cwProgress);
      item.classList.toggle('is-active', index === activeIndex);
      item.classList.toggle('is-complete', index < activeIndex);
    });
  }

  function selectArtwork(root, url) {
    const artwork = root.querySelector('[data-cw-artwork-image]');
    if (artwork && url) artwork.src = url;
  }

  function setStatus(root, message) {
    setText(root.querySelector('[data-cw-status]'), message);
  }

  async function requestRemoteDesign(root, file, style) {
    const endpoint = clean(root.dataset.cwAiEndpoint);
    if (!endpoint) return null;
    const names = root.querySelector('[data-cw-names-input]');
    const year = root.querySelector('[data-cw-year-input]');
    const font = root.querySelector('[data-cw-font-input]');
    const formData = new FormData();
    formData.append('photo', file, file.name);
    formData.append('style', style);
    formData.append('names', clean(names?.value));
    formData.append('year', clean(year?.value));
    formData.append('font', font?.value || 'Signatur');
    formData.append('garment', root.dataset.cwGarment || 'T-Shirt');
    const response = await fetch(endpoint, { method: 'POST', body: formData, credentials: 'same-origin' });
    if (!response.ok) throw new Error('Der KI-Dienst ist gerade nicht erreichbar. Bitte versuche es erneut.');
    const result = await response.json();
    if (!result.previewUrl || !result.designId) throw new Error('Der KI-Dienst hat keine vollständige Designantwort geliefert.');
    return result;
  }

  function init(root) {
    if (root.dataset.cwInitialized === 'true') return;
    const form = root.closest('form');
    const photoInput = root.querySelector('[data-cw-photo-input]');
    const referenceFile = root.querySelector('[data-cw-reference-file]');
    const printFile = root.querySelector('[data-cw-print-file]');
    const printUrl = root.querySelector('[data-cw-print-url]');
    const designId = root.querySelector('[data-cw-design-id]');
    const productionStatus = root.querySelector('[data-cw-production-status]');
    const generateButton = root.querySelector('[data-cw-generate-button]');
    const photoName = root.querySelector('[data-cw-photo-name]');
    const photoError = root.querySelector('[data-cw-photo-error]');
    const generationNote = root.querySelector('[data-cw-generation-note]');
    const previewStatus = root.querySelector('[data-cw-preview-status]');
    const names = root.querySelector('[data-cw-names-input]');
    const year = root.querySelector('[data-cw-year-input]');
    const font = root.querySelector('[data-cw-font-input]');
    if (!form || !photoInput || !generateButton || !names || !year || !font) return;

    root.dataset.cwInitialized = 'true';
    const state = { photo: null, designReady: false, generating: false, localLineArt: null, printReady: false, printRevision: 0 };

    const showPhotoError = (message) => {
      setText(photoError, message);
      photoInput.setCustomValidity(message);
    };

    const resetDesign = () => {
      state.designReady = false;
      state.localLineArt = null;
      state.printReady = false;
      state.printRevision += 1;
      if (printFile) printFile.value = '';
      if (printUrl) printUrl.value = '';
      if (designId) designId.value = '';
      if (productionStatus) productionStatus.value = 'Entwurf – Prüfung erforderlich';
      selectArtwork(root, root.dataset.cwDefaultArtwork);
      setText(previewStatus, 'ENTWURF – NOCH NICHT PRODUKTION');
      setText(generationNote, 'Die Vorschau wird erst nach eurer Bestätigung zur Bestellung hinzugefügt.');
      updateProgress(root, state.photo ? 'design' : 'upload');
    };

    const syncLocalPrintFile = async () => {
      if (!state.localLineArt) return;
      const revision = state.printRevision + 1;
      state.printRevision = revision;
      state.printReady = false;
      try {
        const blob = await renderProductionDraft(state.localLineArt, names.value, year.value, font.value);
        if (revision !== state.printRevision) return;
        const file = new File([blob], `couple-wear-${Date.now()}-print-draft.png`, { type: 'image/png' });
        const fileAttached = setFile(printFile, file);
        state.printReady = fileAttached;
        if (productionStatus) productionStatus.value = fileAttached ? 'Lokaler Entwurf – Prüfung erforderlich' : 'Lokaler Entwurf – Datei über App sichern';
        setText(generationNote, fileAttached
          ? 'Linienkunst-Entwurf bereit. Die vollständige Druckdatei wird vor der Produktion geprüft.'
          : 'Linienkunst-Entwurf bereit. Für die Produktion benötigt der Shop den verbundenen Studio-Dienst.');
      } catch (error) {
        state.printReady = false;
        setText(generationNote, error.message || 'Die Druckdatei konnte nicht aktualisiert werden.');
      }
    };

    photoInput.addEventListener('change', () => {
      const file = photoInput.files?.[0];
      if (!isImageFile(file)) {
        state.photo = null;
        setText(photoName, 'Kein gültiges Foto gewählt');
        showPhotoError('Bitte wähle ein JPG-, PNG- oder WebP-Foto aus.');
        resetDesign();
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        state.photo = null;
        setText(photoName, file.name);
        showPhotoError('Dieses Foto ist größer als 10 MB. Bitte wähle eine kleinere Datei.');
        resetDesign();
        return;
      }
      state.photo = file;
      setText(photoName, file.name);
      showPhotoError('');
      setFile(referenceFile, file);
      resetDesign();
      updateProgress(root, 'design');
      setStatus(root, `Foto ${file.name} wurde ausgewählt.`);
    });

    [names, year].forEach((input) => input.addEventListener('input', () => {
      input.setCustomValidity('');
      updatePreview(root);
      if (state.localLineArt) void syncLocalPrintFile();
      if (state.designReady) updateProgress(root, 'ready');
      else updateProgress(root, 'personalize');
    }));
    font.addEventListener('change', () => {
      updatePreview(root);
      if (state.localLineArt) void syncLocalPrintFile();
    });
    root.querySelectorAll('[data-cw-style-input]').forEach((input) => input.addEventListener('change', () => {
      updatePreview(root);
      if (state.photo) resetDesign();
    }));

    generateButton.addEventListener('click', async () => {
      if (!state.photo) {
        showPhotoError('Bitte wähle zuerst euer Foto aus.');
        photoInput.focus();
        return;
      }
      if (state.generating) return;
      state.generating = true;
      generateButton.disabled = true;
      root.dataset.cwGenerating = 'true';
      setText(generationNote, 'Euer Entwurf wird erstellt …');
      setStatus(root, 'Die Linienzeichnung wird erstellt.');
      try {
        const style = root.querySelector('[data-cw-style-input]:checked')?.value || 'Fine Line';
        const remoteDesign = await requestRemoteDesign(root, state.photo, style);
        if (remoteDesign) {
          selectArtwork(root, remoteDesign.previewUrl);
          if (designId) designId.value = remoteDesign.designId;
          if (printUrl) printUrl.value = remoteDesign.printFileUrl || '';
          if (productionStatus) productionStatus.value = remoteDesign.printStatus || 'Prüfung erforderlich';
          setText(generationNote, 'KI-Entwurf bereit. Unser Team prüft die Druckdatei vor der Produktion.');
        } else {
          const localDesign = await renderLineArt(state.photo, style);
          state.localLineArt = localDesign;
          await syncLocalPrintFile();
          selectArtwork(root, localDesign.previewUrl);
          if (designId) designId.value = `local-${Date.now()}`;
        }
        state.designReady = true;
        setText(previewStatus, 'LINIENKUNST ERSTELLT – PRÜFUNG FOLGT');
        updateProgress(root, clean(names.value) ? 'ready' : 'personalize');
        setStatus(root, 'Euer Design ist bereit für die Personalisierung.');
      } catch (error) {
        state.designReady = false;
        setText(generationNote, error.message || 'Der Entwurf konnte nicht erstellt werden.');
        setStatus(root, error.message || 'Der Entwurf konnte nicht erstellt werden.');
      } finally {
        state.generating = false;
        generateButton.disabled = false;
        delete root.dataset.cwGenerating;
      }
    });

    form.addEventListener('submit', (event) => {
      names.value = clean(names.value);
      year.value = clean(year.value);
      updatePreview(root);
      if (!state.photo) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showPhotoError('Bitte wähle euer Foto aus.');
        photoInput.focus();
        return;
      }
      if (!state.designReady) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(root, 'Bitte erstellt zuerst eure Linienkunst.');
        generateButton.focus();
        return;
      }
      if (state.localLineArt && !state.printReady) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(root, 'Die Druckdatei wird noch aktualisiert. Bitte warte einen Moment.');
        return;
      }
      if (!names.value) {
        event.preventDefault();
        event.stopImmediatePropagation();
        names.setCustomValidity('Bitte gib eure Namen ein.');
        names.reportValidity();
        return;
      }
      setStatus(root, 'Design und Personalisierung werden mit der Bestellung übermittelt.');
    }, { capture: true });

    updatePreview(root);
    updateProgress(root, 'upload');
  }

  function boot(scope = document) {
    scope.querySelectorAll('[data-cw-personalizer]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
  document.addEventListener('shopify:section:load', (event) => boot(event.target));
})();
