/* Zakładka / Moduł "Przypomnienia" na wzór iCloud:
   - Sekcje / Listy z edycją nazw, kolorów i usuwaniem
   - Przypomnienia główne
   - Przypomnienia zagnieżdżone (przypomnienie w przypomnienie)
   - Odklikiwanie (przenoszenie do Archiwum)
   - Archiwum wykonanych zadań z możliwością przywrócenia */
const Reminders = {
  currentSectionId: 'all',
  showArchive: false,
  modalSelectedColor: '#2563eb',
  REM_COLORS: ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#dc2626', '#475569'],

  data() {
    return Store.reminders || Store.loadReminders();
  },

  save() {
    Store.saveReminders();
    this.render();
    if (typeof App !== 'undefined' && App.updateDashboardStats) {
      App.updateDashboardStats();
    }
  },

  activeCount() {
    const items = this.data().items || [];
    return items.filter(i => !i.done).length;
  },

  /* ---------- Sekcje (Listy przypomnień) ---------- */
  openSectionModal(secId = null) {
    const isEdit = !!secId;
    const sec = isEdit ? this.data().sections.find(s => s.id === secId) : null;

    const titleEl = $('remSecModalTitle');
    if (titleEl) titleEl.textContent = isEdit ? 'Edytuj listę przypomnień' : 'Nowa lista przypomnień';

    const idInput = $('remSecId');
    if (idInput) idInput.value = isEdit ? sec.id : '';

    const nameInput = $('remSecNameInput');
    if (nameInput) nameInput.value = isEdit ? sec.name : '';

    this.modalSelectedColor = isEdit ? (sec.color || '#2563eb') : this.REM_COLORS[this.data().sections.length % this.REM_COLORS.length];
    this.renderColorsPicker();

    const delBtn = $('remSecModalDeleteBtn');
    if (delBtn) delBtn.hidden = !isEdit;

    openModal('remSectionModal');
    if (nameInput) setTimeout(() => nameInput.focus(), 80);
  },

  renderColorsPicker() {
    const picker = $('remSecColorsPicker');
    if (!picker) return;
    picker.innerHTML = this.REM_COLORS.map(c => `
      <button type="button" class="rem-color-option ${c === this.modalSelectedColor ? 'selected' : ''}"
        data-color="${c}" style="background:${c}" title="Wybierz ten kolor">
        ${c === this.modalSelectedColor ? '✓' : ''}
      </button>
    `).join('');
  },

  saveSectionFromModal(e) {
    if (e) e.preventDefault();
    const idInput = $('remSecId');
    const nameInput = $('remSecNameInput');
    const name = (nameInput?.value || '').trim();
    if (!name) return toast('Wpisz nazwę listy');

    const secId = idInput?.value;
    const color = this.modalSelectedColor || '#2563eb';

    if (secId) {
      // Edycja istniejącej listy
      const sec = this.data().sections.find(s => s.id === secId);
      if (!sec) return;
      sec.name = name;
      sec.color = color;
      this.save();
      closeModal('remSectionModal');
      toast(`Zmieniono nazwę listy na „${name}”`);
    } else {
      // Nowa lista
      const newSec = {
        id: 'sec-' + Date.now(),
        name: name,
        color: color
      };
      this.data().sections.push(newSec);
      this.currentSectionId = newSec.id;
      this.save();
      closeModal('remSectionModal');
      toast(`Dodano nową listę „${name}”`);
    }
  },

  removeSection(secId) {
    const d = this.data();
    const sec = d.sections.find(s => s.id === secId);
    if (!sec) return;

    if (d.sections.length <= 1) {
      alert('Nie można usunąć ostatniej listy przypomnień.');
      return;
    }

    const itemsCount = d.items.filter(i => i.sectionId === secId).length;
    const fallbackSec = d.sections.find(s => s.id !== secId);
    const msg = itemsCount > 0
      ? `Czy na pewno usunąć listę „${sec.name}”?\nZnajduje się w niej ${itemsCount} przypomnień – zostaną one przeniesione do listy „${fallbackSec.name}”.`
      : `Czy na pewno chcesz usunąć listę „${sec.name}”?`;

    if (!confirm(msg)) return;

    d.sections = d.sections.filter(s => s.id !== secId);
    d.items.forEach(i => {
      if (i.sectionId === secId) i.sectionId = fallbackSec.id;
    });

    if (this.currentSectionId === secId) {
      this.currentSectionId = fallbackSec.id;
    }

    this.save();
    closeModal('remSectionModal');
    toast(`Usunięto listę „${sec.name}”`);
  },

  /* ---------- Przypomnienia ---------- */
  getSectionBadge(sectionId) {
    if (!sectionId) return '';
    const sec = (this.data().sections || []).find(s => s.id === sectionId);
    if (!sec) return '';
    const color = sec.color || '#2563eb';
    return `
      <span class="rem-sec-badge" data-switch-sec="${sec.id}" style="color:${color}; background:${color}18; border-color:${color}40;" title="Lista: ${esc(sec.name)} (kliknij, aby otworzyć tę listę)">
        <span class="rem-sec-badge-dot" style="background:${color}"></span>
        <span class="rem-sec-badge-name">${esc(sec.name)}</span>
      </span>
    `;
  },

  addItem(text, sectionId = null, parentId = null) {
    const clean = (text || '').trim();
    if (!clean) return;
    const parent = parentId ? this.data().items.find(p => p.id === parentId) : null;
    const secId = sectionId || (parent ? parent.sectionId : null) || (this.currentSectionId !== 'all' ? this.currentSectionId : (this.data().sections[0]?.id || 'sec-general'));
    const item = {
      id: 'rem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      sectionId: secId,
      text: clean,
      done: false,
      parentId: parentId || null,
      createdAt: Date.now()
    };
    this.data().items.push(item);
    this.save();
    toast('Dodano przypomnienie');
  },

  toggleDone(id, isDone) {
    const item = this.data().items.find(i => i.id === id);
    if (!item) return;
    item.done = isDone;
    item.doneAt = isDone ? Date.now() : null;

    if (isDone) {
      this.data().items.filter(i => i.parentId === id).forEach(child => {
        child.done = true;
        child.doneAt = Date.now();
      });
      toast('Zadanie przeniesione do Archiwum', 'Cofnij', () => this.toggleDone(id, false));
    } else {
      if (item.parentId) {
        const parent = this.data().items.find(i => i.id === item.parentId);
        if (parent && parent.done) {
          parent.done = false;
          parent.doneAt = null;
        }
      }
      toast('Przywrócono przypomnienie');
    }
    this.save();
  },

  removeItem(id) {
    if (!confirm('Usunąć to przypomnienie na stałe?')) return;
    const d = this.data();
    d.items = d.items.filter(i => i.id !== id && i.parentId !== id);
    this.save();
    toast('Przypomnienie usunięte');
  },

  clearArchive() {
    if (!confirm('Czy na pewno wyczyścić całe archiwum ukończonych przypomnień?')) return;
    const d = this.data();
    d.items = d.items.filter(i => !i.done);
    this.save();
    toast('Archiwum wyczyszczone');
  },

  /* ---------- Renderowanie ---------- */
  render() {
    const data = this.data();
    const sections = data.sections || [];
    const items = data.items || [];

    // Render paska sekcji w stylu iCloud
    const sectionsBar = $('remindersSectionsBar');
    if (sectionsBar) {
      const allActiveCount = items.filter(i => !i.done).length;
      let html = `
        <button type="button" class="rem-section-tab ${this.currentSectionId === 'all' ? 'active' : ''}" data-rem-sec="all">
          <span class="rem-sec-dot" style="background:#2563eb"></span>
          Wszystkie
          <span class="rem-sec-count">${allActiveCount}</span>
        </button>
      `;

      html += sections.map(s => {
        const count = items.filter(i => !i.done && i.sectionId === s.id).length;
        return `
          <button type="button" class="rem-section-tab ${this.currentSectionId === s.id ? 'active' : ''}" data-rem-sec="${s.id}">
            <span class="rem-sec-dot" style="background:${s.color || '#2563eb'}"></span>
            ${esc(s.name)}
            <span class="rem-sec-count">${count}</span>
          </button>
        `;
      }).join('');

      html += `<button type="button" class="btn small rem-add-sec-btn" id="addRemSectionBtn">+ Nowa lista</button>`;
      sectionsBar.innerHTML = html;
    }

    const activeItems = items.filter(i => {
      if (i.done) return false;
      if (this.currentSectionId === 'all') return true;
      return i.sectionId === this.currentSectionId;
    });

    const archivedItems = items.filter(i => i.done);

    // Nagłówek aktualnej listy i przyciski edycji/usuwania
    const curSec = sections.find(s => s.id === this.currentSectionId);
    const titleEl = $('remindersSectionTitle');
    const dotEl = $('remindersSectionDot');
    const actionsEl = $('remindersSectionActions');

    if (this.currentSectionId === 'all') {
      if (titleEl) {
        titleEl.textContent = 'Wszystkie przypomnienia';
        titleEl.style.cursor = 'default';
        titleEl.title = '';
      }
      if (dotEl) {
        dotEl.hidden = false;
        dotEl.style.background = '#2563eb';
      }
      if (actionsEl) actionsEl.hidden = true;
    } else {
      if (titleEl) {
        titleEl.textContent = curSec?.name || 'Przypomnienia';
        titleEl.style.cursor = 'pointer';
        titleEl.title = 'Kliknij, aby zmienić nazwę listy';
      }
      if (dotEl) {
        dotEl.hidden = false;
        dotEl.style.background = curSec?.color || '#2563eb';
      }
      if (actionsEl) {
        actionsEl.hidden = false;
        const editBtn = $('editCurSecBtn');
        const delBtn = $('deleteCurSecBtn');
        if (editBtn) editBtn.dataset.secId = curSec?.id || '';
        if (delBtn) delBtn.dataset.secId = curSec?.id || '';
      }
    }

    const secSelect = $('remAddSecSelect');
    if (secSelect) {
      if (this.currentSectionId === 'all' && sections.length > 0) {
        secSelect.hidden = false;
        secSelect.innerHTML = sections.map(s => `
          <option value="${s.id}">${esc(s.name)}</option>
        `).join('');
      } else {
        secSelect.hidden = true;
      }
    }

    const listEl = $('remindersActiveList');
    if (listEl) {
      const rootItems = activeItems.filter(i => !i.parentId || !activeItems.some(p => p.id === i.parentId));
      if (!rootItems.length) {
        listEl.innerHTML = `<div class="rem-empty">Brak aktywnych przypomnień w tej sekcji. Wpisz treść poniżej, aby dodać nowe zadanie. 👍</div>`;
      } else {
        listEl.innerHTML = rootItems.map(item => this.renderItemCard(item, activeItems, 0)).join('');
      }
    }

    const archiveBox = $('remindersArchiveBox');
    const archiveCountEl = $('remindersArchiveCount');
    if (archiveCountEl) archiveCountEl.textContent = archivedItems.length;

    if (archiveBox) {
      archiveBox.hidden = !this.showArchive;
      if (this.showArchive) {
        if (!archivedItems.length) {
          archiveBox.innerHTML = `<div class="rem-empty">Archiwum jest puste.</div>`;
        } else {
          archiveBox.innerHTML = `
            <div class="archive-header-row">
              <span class="muted small">Zakończone zadania przeniesione do archiwum:</span>
              <button type="button" class="btn small danger" id="clearArchiveBtn">Wyczyść archiwum</button>
            </div>
            <div class="archive-items-list">
              ${archivedItems.map(i => {
                const itemSecId = i.sectionId || (i.parentId ? archivedItems.find(p => p.id === i.parentId)?.sectionId : null);
                const badgeHtml = this.getSectionBadge(itemSecId);
                return `
                  <div class="rem-item rem-item-done" data-id="${i.id}">
                    <button type="button" class="rem-checkbox checked" data-toggle-rem="${i.id}" title="Przywróć na listę aktywnych">✓</button>
                    <div class="rem-content-col">
                      <span class="rem-text">${esc(i.text)}</span>
                      ${badgeHtml}
                    </div>
                    <span class="muted small">${i.doneAt ? shortDate(new Date(i.doneAt)) : ''}</span>
                    <button type="button" class="btn small icon" data-remove-rem="${i.id}" title="Usuń na stałe">✕</button>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      }
    }
  },

  renderItemCard(item, allActive, depth = 0) {
    const children = allActive.filter(c => c.parentId === item.id);
    const subtasksHtml = children.length
      ? `<div class="rem-subtasks-tree">
          ${children.map(ch => this.renderItemCard(ch, allActive, depth + 1)).join('')}
         </div>`
      : '';

    const showBadge = this.currentSectionId === 'all';
    const itemSecId = item.sectionId || (item.parentId ? allActive.find(p => p.id === item.parentId)?.sectionId : null);
    const badgeHtml = showBadge ? this.getSectionBadge(itemSecId) : '';

    return `
      <div class="rem-item-wrap ${depth > 0 ? 'rem-nested' : ''}">
        <div class="rem-item" data-id="${item.id}">
          <button type="button" class="rem-checkbox" data-toggle-rem="${item.id}" title="Odkliknij (przenieś do archiwum)"></button>
          <div class="rem-content-col">
            <span class="rem-text">${esc(item.text)}</span>
            ${badgeHtml}
          </div>
          <div class="rem-item-actions">
            <button type="button" class="btn small rem-add-sub-btn" data-add-sub="${item.id}" title="Włóż przypomnienie w przypomnienie">+ Podzadanie</button>
            <button type="button" class="btn small icon rem-remove-btn" data-remove-rem="${item.id}" title="Usuń przypomnienie">✕</button>
          </div>
        </div>
        ${subtasksHtml}
      </div>
    `;
  },

  init() {
    const secBar = $('remindersSectionsBar');
    if (secBar) {
      secBar.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-rem-sec]');
        if (tab) {
          this.currentSectionId = tab.dataset.remSec;
          this.render();
          return;
        }
        if (e.target.closest('#addRemSectionBtn')) {
          this.openSectionModal(null);
          return;
        }
      });
    }

    // Edycja i usuwanie z poziomu nagłówka listy
    $('editCurSecBtn')?.addEventListener('click', () => {
      if (this.currentSectionId !== 'all') {
        this.openSectionModal(this.currentSectionId);
      }
    });

    $('deleteCurSecBtn')?.addEventListener('click', () => {
      if (this.currentSectionId !== 'all') {
        this.removeSection(this.currentSectionId);
      }
    });

    $('remindersSectionTitle')?.addEventListener('click', () => {
      if (this.currentSectionId !== 'all') {
        this.openSectionModal(this.currentSectionId);
      }
    });

    // Formularz modala edycji/dodawania listy
    $('remSectionForm')?.addEventListener('submit', (e) => this.saveSectionFromModal(e));

    $('remSecModalDeleteBtn')?.addEventListener('click', () => {
      const secId = $('remSecId')?.value;
      if (secId) this.removeSection(secId);
    });

    // Wybór koloru w modalu
    $('remSecColorsPicker')?.addEventListener('click', (e) => {
      const colorBtn = e.target.closest('[data-color]');
      if (colorBtn) {
        this.modalSelectedColor = colorBtn.dataset.color;
        this.renderColorsPicker();
      }
    });

    const addForm = $('remAddForm');
    if (addForm) {
      addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = $('remAddInput');
        const text = input ? input.value.trim() : '';
        if (text) {
          const secSelect = $('remAddSecSelect');
          const chosenSecId = (this.currentSectionId === 'all' && secSelect && !secSelect.hidden) ? secSelect.value : null;
          this.addItem(text, chosenSecId);
          input.value = '';
          input.focus();
        }
      });
    }

    const activeList = $('remindersActiveList');
    if (activeList) {
      activeList.addEventListener('click', (e) => {
        const switchSecBtn = e.target.closest('[data-switch-sec]');
        if (switchSecBtn) {
          const targetSecId = switchSecBtn.dataset.switchSec;
          if (targetSecId) {
            this.currentSectionId = targetSecId;
            this.render();
            return;
          }
        }

        const toggleBtn = e.target.closest('[data-toggle-rem]');
        if (toggleBtn) {
          return this.toggleDone(toggleBtn.dataset.toggleRem, true);
        }

        const addSubBtn = e.target.closest('[data-add-sub]');
        if (addSubBtn) {
          const parentId = addSubBtn.dataset.addSub;
          const text = prompt('Wpisz zadanie podrzędne (przypomnienie w przypomnienie):');
          if (text) this.addItem(text, null, parentId);
          return;
        }

        const removeBtn = e.target.closest('[data-remove-rem]');
        if (removeBtn) {
          return this.removeItem(removeBtn.dataset.removeRem);
        }
      });
    }

    const archiveToggle = $('toggleArchiveBtn');
    if (archiveToggle) {
      archiveToggle.addEventListener('click', () => {
        this.showArchive = !this.showArchive;
        archiveToggle.textContent = this.showArchive ? 'Ukryj archiwum' : 'Pokaż archiwum';
        this.render();
      });
    }

    const archiveBox = $('remindersArchiveBox');
    if (archiveBox) {
      archiveBox.addEventListener('click', (e) => {
        const switchSecBtn = e.target.closest('[data-switch-sec]');
        if (switchSecBtn) {
          const targetSecId = switchSecBtn.dataset.switchSec;
          if (targetSecId) {
            this.currentSectionId = targetSecId;
            this.render();
            return;
          }
        }

        const toggleBtn = e.target.closest('[data-toggle-rem]');
        if (toggleBtn) {
          return this.toggleDone(toggleBtn.dataset.toggleRem, false);
        }

        const removeBtn = e.target.closest('[data-remove-rem]');
        if (removeBtn) {
          return this.removeItem(removeBtn.dataset.removeRem);
        }

        if (e.target.closest('#clearArchiveBtn')) {
          return this.clearArchive();
        }
      });
    }
  }
};
