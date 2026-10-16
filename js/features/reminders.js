/* Zakładka / Moduł "Przypomnienia" na wzór iCloud:
   - Sekcje (kategorie)
   - Przypomnienia główne
   - Przypomnienia zagnieżdżone (przypomnienie w przypomnienie)
   - Odklikiwanie (przenoszenie do Archiwum)
   - Archiwum wykonanych zadań z możliwością przywrócenia */
const Reminders = {
  currentSectionId: 'all',
  showArchive: false,

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

  /* ---------- Sekcje ---------- */
  addSection(name) {
    const clean = (name || '').trim();
    if (!clean) return;
    const colors = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04'];
    const color = colors[this.data().sections.length % colors.length];
    const newSec = {
      id: 'sec-' + Date.now(),
      name: clean,
      color: color
    };
    this.data().sections.push(newSec);
    this.currentSectionId = newSec.id;
    this.save();
    toast(`Dodano sekcję „${clean}”`);
  },

  removeSection(secId) {
    if (!confirm('Usunąć tę sekcję i przenieść jej przypomnienia do sekcji Ogólne?')) return;
    const d = this.data();
    d.sections = d.sections.filter(s => s.id !== secId);
    d.items.forEach(i => {
      if (i.sectionId === secId) i.sectionId = d.sections[0]?.id || 'sec-general';
    });
    if (this.currentSectionId === secId) this.currentSectionId = 'all';
    this.save();
    toast('Sekcja usunięta');
  },

  /* ---------- Przypomnienia ---------- */
  addItem(text, sectionId = null, parentId = null) {
    const clean = (text || '').trim();
    if (!clean) return;
    const secId = sectionId || (this.currentSectionId !== 'all' ? this.currentSectionId : (this.data().sections[0]?.id || 'sec-general'));
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

      html += `<button type="button" class="btn small rem-add-sec-btn" id="addRemSectionBtn">+ Nowa sekcja</button>`;
      sectionsBar.innerHTML = html;
    }

    const activeItems = items.filter(i => {
      if (i.done) return false;
      if (this.currentSectionId === 'all') return true;
      return i.sectionId === this.currentSectionId;
    });

    const archivedItems = items.filter(i => i.done);

    const curSec = sections.find(s => s.id === this.currentSectionId);
    const titleEl = $('remindersSectionTitle');
    if (titleEl) {
      titleEl.textContent = this.currentSectionId === 'all' ? 'Wszystkie przypomnienia' : (curSec?.name || 'Przypomnienia');
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
              ${archivedItems.map(i => `
                <div class="rem-item rem-item-done" data-id="${i.id}">
                  <button type="button" class="rem-checkbox checked" data-toggle-rem="${i.id}" title="Przywróć na listę aktywnych">✓</button>
                  <span class="rem-text">${esc(i.text)}</span>
                  <span class="muted small">${i.doneAt ? shortDate(new Date(i.doneAt)) : ''}</span>
                  <button type="button" class="btn small icon" data-remove-rem="${i.id}" title="Usuń na stałe">✕</button>
                </div>
              `).join('')}
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

    return `
      <div class="rem-item-wrap ${depth > 0 ? 'rem-nested' : ''}">
        <div class="rem-item" data-id="${item.id}">
          <button type="button" class="rem-checkbox" data-toggle-rem="${item.id}" title="Odkliknij (przenieś do archiwum)"></button>
          <span class="rem-text">${esc(item.text)}</span>
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
          const name = prompt('Nazwa nowej sekcji przypomnień (np. Hurtownia, Narzędzia):');
          if (name) this.addSection(name);
          return;
        }
      });
    }

    const addForm = $('remAddForm');
    if (addForm) {
      addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = $('remAddInput');
        if (input && input.value.trim()) {
          this.addItem(input.value.trim());
          input.value = '';
          input.focus();
        }
      });
    }

    const activeList = $('remindersActiveList');
    if (activeList) {
      activeList.addEventListener('click', (e) => {
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
