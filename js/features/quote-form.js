/* Moduł "Wzór formularza wyceny": Ustalenia prac (Wizja lokalna)
   - 1:1 zgodny z modułem w Panelu Muraven (DOCX / A4)
   - Interaktywna mapa pytań do wyceny
   - Eksport do pliku PDF oraz wydruk A4
   - Autozapis roboczy i baza zapisanych formularzy wycen */
const QuoteForm = {
  currentFormId: null,
  DRAFT_KEY: 'muraven_quote_form_current_draft',

  /** Pobiera wszystkie dane z formularza jako obiekt. */
  serializeForm() {
    const sheet = $('sheetInspectionDoc');
    if (!sheet) return null;

    const textInputs = {};
    sheet.querySelectorAll('input[type="text"]').forEach((inp, idx) => {
      const key = inp.id || inp.dataset.field || `inp_${idx}`;
      textInputs[key] = inp.value;
    });

    const checkboxes = {};
    sheet.querySelectorAll('input[type="checkbox"]').forEach((chk, idx) => {
      const key = chk.id || chk.dataset.chk || `chk_${idx}`;
      checkboxes[key] = chk.checked;
    });

    const notes = $('inspNotesArea')?.value || '';

    return {
      docNr: $('inspDocNr')?.value || 'OFT/2026/01',
      clientName: $('inspClientName')?.value || '',
      date: $('inspDate')?.value || '',
      address: $('inspAddress')?.value || '',
      textInputs,
      checkboxes,
      notes,
      updatedAt: Date.now()
    };
  },

  /** Wypełnia formularz danymi z obiektu. */
  deserializeForm(data) {
    if (!data) return;
    const sheet = $('sheetInspectionDoc');
    if (!sheet) return;

    if (data.textInputs) {
      sheet.querySelectorAll('input[type="text"]').forEach((inp, idx) => {
        const key = inp.id || inp.dataset.field || `inp_${idx}`;
        if (data.textInputs[key] !== undefined) {
          inp.value = data.textInputs[key];
        }
      });
    }

    if (data.checkboxes) {
      sheet.querySelectorAll('input[type="checkbox"]').forEach((chk, idx) => {
        const key = chk.id || chk.dataset.chk || `chk_${idx}`;
        if (data.checkboxes[key] !== undefined) {
          chk.checked = !!data.checkboxes[key];
        }
      });
    }

    if (data.notes !== undefined && $('inspNotesArea')) {
      $('inspNotesArea').value = data.notes;
    }

    if (data.docNr && $('inspDocNr')) $('inspDocNr').value = data.docNr;
    if (data.clientName && $('inspClientName')) $('inspClientName').value = data.clientName;
    if (data.date && $('inspDate')) $('inspDate').value = data.date;
    if (data.address && $('inspAddress')) $('inspAddress').value = data.address;
  },

  /** Zapisuje bieżący stan formularza jako roboczy brudnopis (autozapis). */
  autoSaveDraft() {
    const data = this.serializeForm();
    if (!data) return;
    try {
      localStorage.setItem(this.DRAFT_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Błąd zapisu brudnopisu wyceny', e);
    }
  },

  /** Przywraca ostatnio edytowany formularz. */
  restoreDraft() {
    try {
      const raw = localStorage.getItem(this.DRAFT_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.deserializeForm(data);
        return true;
      }
    } catch (e) {
      console.warn('Błąd odczytu brudnopisu wyceny', e);
    }
    return false;
  },

  /** Czyści cały formularz i przygotowuje czysty wzór z pytaniami. */
  clearForm(confirmPrompt = true) {
    if (confirmPrompt) {
      if (!confirm('Wyczyścić wszystkie pola i zaznaczone odpowiedzi w formularzu wyceny?')) {
        return;
      }
    }

    const sheet = $('sheetInspectionDoc');
    if (!sheet) return;

    sheet.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
    sheet.querySelectorAll('input[type="text"]').forEach(t => {
      if (t.id === 'inspDocNr') {
        const currentYear = new Date().getFullYear();
        t.value = `OFT/${currentYear}/01`;
      } else if (t.id === 'inspDate') {
        t.value = new Date().toLocaleDateString('pl-PL');
      } else {
        t.value = '';
      }
    });

    if ($('inspNotesArea')) $('inspNotesArea').value = '';
    this.currentFormId = null;
    this.autoSaveDraft();
    toast('Wyczyszczono formularz do nowego wzoru');
  },

  /** Trwale zapisuje formularz w liście zapisanych wycen w bazie programu. */
  saveToDatabase() {
    const formData = this.serializeForm();
    if (!formData) return;

    const docNr = formData.docNr.trim() || 'OFT/2026/01';
    const client = formData.clientName.trim() || 'Bez nazwy klienta';
    const id = this.currentFormId || ('quote-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
    this.currentFormId = id;

    const entry = {
      id,
      docNr,
      clientName: client,
      date: formData.date || new Date().toLocaleDateString('pl-PL'),
      address: formData.address || '',
      updatedAt: Date.now(),
      data: formData
    };

    Store.saveQuoteFormEntry(entry);
    this.updateSavedBadge();
    toast(`Zapisano formularz: ${docNr} (${client})`);
  },

  /** Eksportuje formularz bezpośrednio do pliku PDF. */
  exportPdf() {
    const sheet = $('sheetInspectionDoc');
    if (!sheet) return;

    const docNr = ($('inspDocNr')?.value || 'OFT_2026').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const client = ($('inspClientName')?.value || 'Wycena').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Wycena_${docNr}_${client}.pdf`;

    if (typeof html2pdf !== 'undefined') {
      toast('Generowanie pliku PDF...');
      const opt = {
        margin: [4, 4, 4, 4],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(sheet).save().then(() => {
        toast(`Pobrano gotowy plik PDF: ${filename}`);
      }).catch(err => {
        console.warn('html2pdf błąd, przejście do druku systemowego', err);
        window.print();
      });
    } else {
      window.print();
    }
  },

  /** Druk A4 przez okno systemowe. */
  printA4() {
    window.print();
  },

  /** Aktualizuje licznik zapisanych wycen w nagłówku. */
  updateSavedBadge() {
    const list = Store.getQuoteForms();
    if ($('savedQuotesCount')) {
      $('savedQuotesCount').textContent = list.length;
    }
    if ($('dashQuoteStat')) {
      $('dashQuoteStat').textContent = list.length
        ? `${list.length} ${plural(list.length, 'zapisany', 'zapisane', 'zapisanych')}`
        : 'Wizja lokalna';
    }
  },

  /** Otwiera modal z listą zapisanych wycen. */
  openSavedModal() {
    const list = Store.getQuoteForms();
    const listEl = $('savedQuotesList');
    if (!listEl) return;

    if (!list.length) {
      listEl.innerHTML = '<div class="cal-archive-empty">Brak zapisanych formularzy wycen w bazie. Wypełnij formularz i kliknij „💾 Zapisz w bazie”.</div>';
    } else {
      listEl.innerHTML = list.map(q => {
        const dateStr = q.date || '';
        const updated = new Date(q.updatedAt || Date.now()).toLocaleDateString('pl-PL');
        return `
          <div class="saved-quote-item" data-quote-id="${esc(q.id)}">
            <div class="saved-quote-info">
              <span class="saved-quote-title"><b>${esc(q.docNr)}</b> — ${esc(q.clientName)}</span>
              <span class="saved-quote-meta">Data sporządzenia: ${esc(dateStr)} ${q.address ? `· Adres: ${esc(q.address)}` : ''} · Zapisano: ${updated}</span>
            </div>
            <div class="saved-quote-btns">
              <button type="button" class="btn small primary" data-load-quote="${esc(q.id)}">Wczytaj</button>
              <button type="button" class="btn small danger" data-delete-quote="${esc(q.id)}">🗑️</button>
            </div>
          </div>`;
      }).join('');
    }

    openModal('savedQuotesModal');
  },

  loadSavedQuote(id) {
    const list = Store.getQuoteForms();
    const found = list.find(q => q.id === id);
    if (!found || !found.data) return;

    this.currentFormId = found.id;
    this.deserializeForm(found.data);
    closeModal('savedQuotesModal');
    toast(`Wczytano wycenę: ${found.docNr} (${found.clientName})`);
  },

  deleteSavedQuote(id) {
    if (!confirm('Czy na pewno chcesz usunąć ten formularz z listy zapisanych?')) return;
    Store.deleteQuoteFormEntry(id);
    this.updateSavedBadge();
    this.openSavedModal();
    toast('Usunięto formularz wyceny z listy');
  },

  init() {
    // 1. Akcje nagłówka formularza wyceny
    $('btnExportQuotePdf')?.addEventListener('click', () => this.exportPdf());
    $('btnPrintQuoteA4')?.addEventListener('click', () => this.printA4());
    $('btnSaveQuoteDraft')?.addEventListener('click', () => this.saveToDatabase());
    $('btnClearQuoteForm')?.addEventListener('click', () => this.clearForm(true));
    $('btnOpenSavedQuotesModal')?.addEventListener('click', () => this.openSavedModal());

    // 2. Kliknięcia wewnątrz modala zapisanych wycen
    $('savedQuotesList')?.addEventListener('click', (e) => {
      const loadBtn = e.target.closest('[data-load-quote]');
      if (loadBtn) {
        return this.loadSavedQuote(loadBtn.dataset.loadQuote);
      }
      const delBtn = e.target.closest('[data-delete-quote]');
      if (delBtn) {
        return this.deleteSavedQuote(delBtn.dataset.deleteQuote);
      }
    });

    // 3. Autozapis przy wpisywaniu i zmianie checkboxów
    const sheet = $('sheetInspectionDoc');
    if (sheet) {
      sheet.addEventListener('input', () => this.autoSaveDraft());
      sheet.addEventListener('change', () => this.autoSaveDraft());
    }

    // 4. Załaduj brudnopis lub przygotuj domyślne daty
    const restored = this.restoreDraft();
    if (!restored) {
      if ($('inspDate') && !$('inspDate').value) {
        $('inspDate').value = new Date().toLocaleDateString('pl-PL');
      }
      if ($('inspDocNr') && !$('inspDocNr').value) {
        $('inspDocNr').value = `OFT/${new Date().getFullYear()}/01`;
      }
    }

    this.updateSavedBadge();
  }
};
