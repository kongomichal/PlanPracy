/* Kalendarz miesięczny na ekranie głównym:
   - Przypomnienia po odklikaniu zostają na miejscu z zielonym ptaszkiem (✓) bez przekreślenia.
   - Odklikane (wykonane) dni całkowicie znikają z kalendarza i trafiają do Archiwum poniżej. */
const Calendar = {
  MONTH_NAMES: [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
  ],
  WEEKDAYS_FULL: ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'],
  WEEKDAYS_SHORT: ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'],

  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  addingDateKey: null,
  editingItem: null, // { key, id }
  archiveOpen: false,
  isCollapsed: localStorage.getItem('muraven_cal_collapsed') === '1',

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    localStorage.setItem('muraven_cal_collapsed', this.isCollapsed ? '1' : '0');
    this.renderCollapseState();
  },

  renderCollapseState() {
    const wrap = $('calContentWrapper');
    const toggleIcon = $('calToggleIcon');
    const toggleText = $('calToggleText');
    const card = $('dashCalendarCard');

    if (wrap) {
      wrap.style.display = this.isCollapsed ? 'none' : '';
    }
    if (toggleIcon) {
      toggleIcon.textContent = this.isCollapsed ? '▸' : '▾';
    }
    if (toggleText) {
      toggleText.textContent = this.isCollapsed ? 'Rozwiń kalendarz' : 'Zwiń kalendarz';
    }
    if (card) {
      card.classList.toggle('is-collapsed', this.isCollapsed);
    }
  },

  prevMonth() {
    this.month--;
    if (this.month < 0) {
      this.month = 11;
      this.year--;
    }
    this.addingDateKey = null;
    this.editingItem = null;
    this.render();
  },

  nextMonth() {
    this.month++;
    if (this.month > 11) {
      this.month = 0;
      this.year++;
    }
    this.addingDateKey = null;
    this.editingItem = null;
    this.render();
  },

  goToday() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.addingDateKey = null;
    this.editingItem = null;
    this.render();
  },

  /** Generuje dni wybranego miesiąca (od 1 do ostatniego dnia miesiąca). */
  buildMonthDays() {
    const firstOfMonth = new Date(this.year, this.month, 1);
    const lastOfMonth = new Date(this.year, this.month + 1, 0);

    const todayStr = dateKey(new Date());
    const days = [];
    let cur = new Date(firstOfMonth);

    while (cur <= lastOfMonth) {
      const k = dateKey(cur);
      const dayOfWeek = (cur.getDay() + 6) % 7; // 0 = Pn ... 6 = Nd
      days.push({
        key: k,
        dayNum: cur.getDate(),
        monthNum: cur.getMonth(),
        inMonth: true,
        isToday: k === todayStr,
        isPast: k < todayStr,
        isWeekend: dayOfWeek >= 5,
        dayOfWeek,
        weekdayFull: this.WEEKDAYS_FULL[dayOfWeek],
        weekdayShort: this.WEEKDAYS_SHORT[dayOfWeek]
      });
      cur = addDays(cur, 1);
    }
    return days;
  },

  /** Zwraca minione dni w wybranym miesiącu, które nie zostały jeszcze odklikane. */
  getUncompletedPastDaysInView() {
    return this.buildMonthDays()
      .filter(d => d.isPast && !Store.isCalendarDayDone(d.key))
      .map(d => d.key);
  },

  dismissDay(key) {
    Store.setCalendarDayDone(key, true);
    if (this.addingDateKey === key) this.addingDateKey = null;
    this.render();

    const d = parseKey(key);
    toast(`Odkliknięto dzień ${DAYS_SHORT[d.getDay()]} ${shortDate(d)} (przeniesiono do archiwum)`, 'Cofnij', () => {
      Store.setCalendarDayDone(key, false);
      this.render();
    });
  },

  completePastDaysInMonth() {
    const pastKeys = this.getUncompletedPastDaysInView();
    if (!pastKeys.length) {
      return toast('Brak minionych dni do odkliknięcia w tym miesiącu');
    }
    pastKeys.forEach(k => Store.setCalendarDayDone(k, true));
    this.addingDateKey = null;
    this.render();
    toast(`Przeniesiono minione dni (${pastKeys.length}) do archiwum`, 'Cofnij', () => {
      pastKeys.forEach(k => Store.setCalendarDayDone(k, false));
      this.render();
    });
  },

  renderArchive() {
    const archivedKeys = Store.getArchivedCalendarDays();
    const countEl = $('calArchiveCount');
    if (countEl) countEl.textContent = archivedKeys.length;

    const restoreAllBtn = $('calRestoreAllBtn');
    if (restoreAllBtn) restoreAllBtn.hidden = archivedKeys.length === 0;

    const toggleBtn = $('calToggleArchiveBtn');
    if (toggleBtn) {
      toggleBtn.textContent = this.archiveOpen ? 'Ukryj archiwum' : 'Pokaż archiwum';
    }

    const boxEl = $('calArchiveBox');
    if (!boxEl) return;
    boxEl.hidden = !this.archiveOpen;
    if (!this.archiveOpen) return;

    if (archivedKeys.length === 0) {
      boxEl.innerHTML = `<div class="cal-archive-empty">Brak odklikanych dni w archiwum. Gdy klikniesz <b>✓</b> przy wybranym dniu w kalendarzu, dzień zniknie z kalendarza i pojawi się tutaj.</div>`;
      return;
    }

    boxEl.innerHTML = archivedKeys.map(key => {
      const d = parseKey(key);
      const reminders = Store.getCalendarDay(key);
      const dateLabel = `${longDate(d)} ${d.getFullYear()}`;

      const remHtml = reminders.length
        ? `<div class="cal-arch-rem-list">
            ${reminders.map(item => `
              <div class="cal-rem-item ${item.done ? 'is-checked' : ''}">
                <button type="button" class="cal-rem-toggle" data-cal-arch-toggle="${esc(item.id)}" data-cal-date="${key}" title="${item.done ? 'Cofnij odklikanie' : 'Odkliknij przypomnienie'}">
                  <span class="cal-rem-box" aria-hidden="true">${item.done ? '✓' : ''}</span>
                  <span class="cal-rem-text">${esc(item.text)}</span>
                </button>
              </div>
            `).join('')}
          </div>`
        : `<div class="cal-arch-no-rem">Brak wpisanych przypomnień w tym dniu</div>`;

      return `
        <div class="cal-arch-card" data-arch-day="${key}">
          <div class="cal-arch-head">
            <div class="cal-arch-date">
              <span class="cal-done-badge">✓ Wykonany dzień</span>
              <strong>${esc(dateLabel)}</strong>
            </div>
            <div class="cal-arch-btns">
              <button type="button" class="btn small" data-cal-restore-day="${key}" title="Przywróć ten dzień z powrotem do kalendarza">↩ Przywróć</button>
              <button type="button" class="btn small danger" data-cal-purge-day="${key}" title="Usuń trwale ten dzień z archiwum">🗑️</button>
            </div>
          </div>
          ${remHtml}
        </div>`;
    }).join('');
  },

  render() {
    const titleEl = $('calMonthTitle');
    if (titleEl) {
      titleEl.textContent = `${this.MONTH_NAMES[this.month]} ${this.year}`;
    }

    // Przycisk "Odkliknij minione dni" w pasku kalendarza
    const pastUncompleted = this.getUncompletedPastDaysInView();
    const pastBtn = $('calCompletePastBtn');
    const pastCountEl = $('calPastDaysCount');
    if (pastCountEl) pastCountEl.textContent = pastUncompleted.length;
    if (pastBtn) pastBtn.hidden = pastUncompleted.length === 0;

    const gridEl = $('calGrid');
    if (!gridEl) return;

    // Pobierz dni wybranego miesiąca i odfiltruj odklikane (wykonane) dni — znikają z kalendarza
    const allDays = this.buildMonthDays();
    const activeDays = allDays.filter(d => !Store.isCalendarDayDone(d.key));

    // Ukryj sztywny pasek nagłówków kolumn, ponieważ każdy kafelek ma własną etykietę dnia tygodnia, a po odklikaniu dni przesuwają się płynnie w górę
    const weekdaysBar = document.querySelector('.cal-weekdays');
    if (weekdaysBar) {
      weekdaysBar.style.display = 'none';
    }

    if (activeDays.length === 0) {
      gridEl.innerHTML = `
        <div class="cal-empty-month">
          Wszystkie dni z tego miesiąca zostały odklikane i przeniesione do <b>Archiwum wykonanych dni</b> poniżej.
        </div>`;
      this.renderArchive();
      return;
    }

    gridEl.innerHTML = activeDays.map(d => {
      const reminders = Store.getCalendarDay(d.key);
      const isAdding = this.addingDateKey === d.key;

      const itemsHtml = reminders.map(item => {
        const isEditing = this.editingItem && this.editingItem.key === d.key && this.editingItem.id === item.id;
        if (isEditing) {
          return `
            <div class="cal-rem-edit-box" data-cal-edit-row="${esc(item.id)}" data-cal-date="${d.key}">
              <input type="text" class="cal-rem-edit-input" value="${esc(item.text)}" data-cal-edit-input="${esc(item.id)}" data-cal-date="${d.key}" autocomplete="off">
              <div class="cal-add-actions">
                <button type="button" class="cal-mini-btn save" data-cal-save-edit="${esc(item.id)}" data-cal-date="${d.key}" title="Zapisz">✓ Zapisz</button>
                <button type="button" class="cal-mini-btn cancel" data-cal-cancel-edit title="Anuluj">✕</button>
              </div>
            </div>`;
        }

        return `
          <div class="cal-rem-item ${item.done ? 'is-checked' : ''}" data-cal-item="${esc(item.id)}" data-cal-date="${d.key}">
            <button type="button" class="cal-rem-toggle" data-cal-toggle="${esc(item.id)}" data-cal-date="${d.key}" title="${item.done ? 'Cofnij odklikanie przypomnienia' : 'Odkliknij przypomnienie (pojawi się ptaszek)'}">
              <span class="cal-rem-box" aria-hidden="true">${item.done ? '✓' : ''}</span>
              <span class="cal-rem-text">${esc(item.text)}</span>
            </button>
            <div class="cal-rem-actions">
              <button type="button" class="cal-rem-act edit" data-cal-start-edit="${esc(item.id)}" data-cal-date="${d.key}" title="Edytuj treść">✏️</button>
              <button type="button" class="cal-rem-act del" data-cal-del="${esc(item.id)}" data-cal-date="${d.key}" title="Usuń przypomnienie">✕</button>
            </div>
          </div>`;
      }).join('');

      const addBoxHtml = isAdding ? `
        <form class="cal-add-form" data-cal-form="${d.key}">
          <input type="text" class="cal-add-input" data-cal-input="${d.key}" placeholder="Wpisz przypomnienie..." autocomplete="off">
          <div class="cal-add-actions">
            <button type="submit" class="cal-mini-btn save" title="Dodaj przypomnienie">✓ Dodaj</button>
            <button type="button" class="cal-mini-btn cancel" data-cal-close-add title="Zamknij">✕</button>
          </div>
        </form>
      ` : '';

      return `
        <div class="cal-day ${d.isToday ? 'today' : ''} ${d.isWeekend ? 'weekend' : ''}" data-cal-day="${d.key}">
          <div class="cal-day-head">
            <span class="cal-day-num">
              <span class="cal-day-wday-badge ${d.isWeekend ? 'weekend' : ''}">${d.weekdayShort}</span>
              <strong>${d.dayNum}.${String(d.monthNum + 1).padStart(2, '0')}</strong>
              ${d.isToday ? '<span class="cal-today-pill">Dziś</span>' : ''}
            </span>
            <div class="cal-day-head-btns">
              <button type="button" class="cal-day-done-btn" data-cal-done-day="${d.key}" title="Odkliknij wykonany dzień (zniknie z kalendarza i trafi do archiwum)">✓</button>
              <button type="button" class="cal-day-add-btn" data-cal-open-add="${d.key}" title="Dodaj przypomnienie w tym dniu">＋</button>
            </div>
          </div>
          <div class="cal-rem-list">${itemsHtml}</div>
          ${addBoxHtml}
        </div>`;
    }).join('');

    if (this.addingDateKey) {
      const inp = gridEl.querySelector(`.cal-add-input[data-cal-input="${this.addingDateKey}"]`);
      if (inp) {
        setTimeout(() => inp.focus(), 10);
      }
    } else if (this.editingItem) {
      const inp = gridEl.querySelector(`.cal-rem-edit-input[data-cal-edit-input="${this.editingItem.id}"]`);
      if (inp) {
        setTimeout(() => {
          inp.focus();
          inp.select();
        }, 10);
      }
    }

    this.renderArchive();
    this.renderCollapseState();
  },

  init() {
    $('calPrevMonthBtn')?.addEventListener('click', () => this.prevMonth());
    $('calNextMonthBtn')?.addEventListener('click', () => this.nextMonth());
    $('calTodayBtn')?.addEventListener('click', () => this.goToday());
    $('calCompletePastBtn')?.addEventListener('click', () => this.completePastDaysInMonth());
    $('calToggleBtn')?.addEventListener('click', () => this.toggleCollapse());
    $('calTitleWrap')?.addEventListener('click', () => this.toggleCollapse());

    $('calToggleArchiveBtn')?.addEventListener('click', () => {
      this.archiveOpen = !this.archiveOpen;
      this.renderArchive();
    });

    $('calRestoreAllBtn')?.addEventListener('click', () => {
      const count = Store.getArchivedCalendarDays().length;
      if (!count) return;
      if (!confirm(`Przywrócić wszystkie odklikane dni (${count}) z archiwum na kalendarz?`)) return;
      Store.restoreAllCalendarDays();
      this.render();
      toast(`Przywrócono ${count} ${plural(count, 'dzień', 'dni', 'dni')} z archiwum`);
    });

    $('calArchiveBox')?.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-cal-arch-toggle]');
      if (toggleBtn) {
        Store.toggleCalendarReminder(toggleBtn.dataset.calDate, toggleBtn.dataset.calArchToggle);
        this.render();
        return;
      }

      const restoreBtn = e.target.closest('[data-cal-restore-day]');
      if (restoreBtn) {
        const key = restoreBtn.dataset.calRestoreDay;
        Store.setCalendarDayDone(key, false);
        this.render();
        const d = parseKey(key);
        toast(`Przywrócono dzień ${DAYS_SHORT[d.getDay()]} ${shortDate(d)} na kalendarz`);
        return;
      }

      const purgeBtn = e.target.closest('[data-cal-purge-day]');
      if (purgeBtn) {
        const key = purgeBtn.dataset.calPurgeDay;
        const d = parseKey(key);
        if (!confirm(`Usunąć trwale z archiwum dzień ${shortDate(d)}.${d.getFullYear()} wraz z jego przypomnieniami?`)) return;
        Store.setCalendarDayDone(key, false);
        if (Store.calendarNotes && Store.calendarNotes.byDate) {
          delete Store.calendarNotes.byDate[key];
          Store.saveCalendar();
        }
        this.render();
        toast('Usunięto dzień z archiwum');
        return;
      }
    });

    const gridEl = $('calGrid');
    if (!gridEl) return;

    gridEl.addEventListener('click', (e) => {
      const doneDayBtn = e.target.closest('[data-cal-done-day]');
      if (doneDayBtn) {
        e.stopPropagation();
        this.dismissDay(doneDayBtn.dataset.calDoneDay);
        return;
      }

      const openAddBtn = e.target.closest('[data-cal-open-add]');
      if (openAddBtn) {
        e.stopPropagation();
        this.editingItem = null;
        this.addingDateKey = openAddBtn.dataset.calOpenAdd;
        this.render();
        return;
      }

      const closeAddBtn = e.target.closest('[data-cal-close-add]');
      if (closeAddBtn) {
        e.stopPropagation();
        this.addingDateKey = null;
        this.render();
        return;
      }

      const toggleBtn = e.target.closest('[data-cal-toggle]');
      if (toggleBtn) {
        e.stopPropagation();
        const key = toggleBtn.dataset.calDate;
        const id = toggleBtn.dataset.calToggle;
        Store.toggleCalendarReminder(key, id);
        this.render();
        return;
      }

      const startEditBtn = e.target.closest('[data-cal-start-edit]');
      if (startEditBtn) {
        e.stopPropagation();
        this.addingDateKey = null;
        this.editingItem = {
          key: startEditBtn.dataset.calDate,
          id: startEditBtn.dataset.calStartEdit
        };
        this.render();
        return;
      }

      const cancelEditBtn = e.target.closest('[data-cal-cancel-edit]');
      if (cancelEditBtn) {
        e.stopPropagation();
        this.editingItem = null;
        this.render();
        return;
      }

      const saveEditBtn = e.target.closest('[data-cal-save-edit]');
      if (saveEditBtn) {
        e.stopPropagation();
        const key = saveEditBtn.dataset.calDate;
        const id = saveEditBtn.dataset.calSaveEdit;
        const box = saveEditBtn.closest('.cal-rem-edit-box');
        const inp = box?.querySelector('.cal-rem-edit-input');
        if (inp && inp.value.trim()) {
          Store.updateCalendarReminder(key, id, inp.value.trim());
        }
        this.editingItem = null;
        this.render();
        return;
      }

      const delBtn = e.target.closest('[data-cal-del]');
      if (delBtn) {
        e.stopPropagation();
        const key = delBtn.dataset.calDate;
        const id = delBtn.dataset.calDel;
        Store.deleteCalendarReminder(key, id);
        this.render();
        return;
      }

      // Kliknięcie w pustą przestrzeń kafelka dnia otwiera wpisywanie przypomnienia
      const dayCell = e.target.closest('[data-cal-day]');
      if (dayCell && !e.target.closest('.cal-add-form') && !e.target.closest('.cal-rem-edit-box') && !e.target.closest('.cal-rem-item')) {
        const key = dayCell.dataset.calDay;
        if (this.addingDateKey !== key) {
          this.editingItem = null;
          this.addingDateKey = key;
          this.render();
        }
      }
    });

    gridEl.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-cal-form]');
      if (!form) return;
      e.preventDefault();
      const key = form.dataset.calForm;
      const inp = form.querySelector('.cal-add-input');
      const val = inp ? inp.value.trim() : '';
      if (val) {
        Store.addCalendarReminder(key, val);
        this.addingDateKey = key;
        this.render();
      } else {
        this.addingDateKey = null;
        this.render();
      }
    });

    gridEl.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('cal-add-input')) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.addingDateKey = null;
          this.render();
        }
      } else if (e.target.classList.contains('cal-rem-edit-input')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const key = e.target.dataset.calDate;
          const id = e.target.dataset.calEditInput;
          if (e.target.value.trim()) {
            Store.updateCalendarReminder(key, id, e.target.value.trim());
          }
          this.editingItem = null;
          this.render();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.editingItem = null;
          this.render();
        }
      }
    });
  }
};
