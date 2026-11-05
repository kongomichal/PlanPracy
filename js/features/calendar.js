/* Kalendarz miesięczny (Poniedziałek – Niedziela) na ekranie głównym z przypomnieniami i ptaszkiem (✓) */
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

  /** Generuje dni siatki miesiąca od poniedziałku pierwszego tygodnia do niedzieli ostatniego tygodnia. */
  buildGridDays() {
    const firstOfMonth = new Date(this.year, this.month, 1);
    const lastOfMonth = new Date(this.year, this.month + 1, 0);

    const startMonday = mondayOf(firstOfMonth);
    const lastDayShift = (lastOfMonth.getDay() + 6) % 7; // 0 = Pn ... 6 = Nd
    const endSunday = addDays(lastOfMonth, 6 - lastDayShift);

    const todayStr = dateKey(new Date());
    const days = [];
    let cur = new Date(startMonday);

    while (cur <= endSunday) {
      const k = dateKey(cur);
      const dayOfWeek = (cur.getDay() + 6) % 7; // 0 = Pn ... 6 = Nd
      days.push({
        key: k,
        dayNum: cur.getDate(),
        monthNum: cur.getMonth(),
        inMonth: cur.getMonth() === this.month && cur.getFullYear() === this.year,
        isToday: k === todayStr,
        isWeekend: dayOfWeek >= 5,
        weekdayShort: this.WEEKDAYS_SHORT[dayOfWeek]
      });
      cur = addDays(cur, 1);
    }
    return days;
  },

  render() {
    const titleEl = $('calMonthTitle');
    if (titleEl) {
      titleEl.textContent = `${this.MONTH_NAMES[this.month]} ${this.year}`;
    }

    const gridEl = $('calGrid');
    if (!gridEl) return;

    const days = this.buildGridDays();

    gridEl.innerHTML = days.map(d => {
      const reminders = Store.getCalendarDay(d.key);
      const isAdding = this.addingDateKey === d.key;

      const itemsHtml = reminders.map(item => {
        const isEditing = this.editingItem && this.editingItem.key === d.key && this.editingItem.id === item.id;
        if (isEditing) {
          return `
            <div class="cal-rem-edit-box" data-cal-edit-row="${esc(item.id)}" data-cal-date="${d.key}">
              <input type="text" class="cal-rem-edit-input" value="${esc(item.text)}" data-cal-edit-input="${esc(item.id)}" data-cal-date="${d.key}" autocomplete="off">
              <button type="button" class="cal-mini-btn save" data-cal-save-edit="${esc(item.id)}" data-cal-date="${d.key}" title="Zapisz">✓</button>
              <button type="button" class="cal-mini-btn cancel" data-cal-cancel-edit title="Anuluj">✕</button>
            </div>`;
        }

        return `
          <div class="cal-rem-item ${item.done ? 'is-checked' : ''}" data-cal-item="${esc(item.id)}" data-cal-date="${d.key}">
            <button type="button" class="cal-rem-toggle" data-cal-toggle="${esc(item.id)}" data-cal-date="${d.key}" title="${item.done ? 'Cofnij odklikanie' : 'Odkliknij przypomnienie'}">
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

      const monthSuffix = !d.inMonth ? `.${String(d.monthNum + 1).padStart(2, '0')}` : '';

      return `
        <div class="cal-day ${d.inMonth ? '' : 'outside'} ${d.isToday ? 'today' : ''} ${d.isWeekend ? 'weekend' : ''}" data-cal-day="${d.key}">
          <div class="cal-day-head">
            <span class="cal-day-num">
              <span class="cal-day-wday-mobile">${d.weekdayShort}</span>
              ${d.dayNum}${monthSuffix}
              ${d.isToday ? '<span class="cal-today-pill">Dziś</span>' : ''}
            </span>
            <button type="button" class="cal-day-add-btn" data-cal-open-add="${d.key}" title="Dodaj przypomnienie w tym dniu">＋</button>
          </div>
          <div class="cal-rem-list">
            ${itemsHtml}
          </div>
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
  },

  init() {
    $('calPrevMonthBtn')?.addEventListener('click', () => this.prevMonth());
    $('calNextMonthBtn')?.addEventListener('click', () => this.nextMonth());
    $('calTodayBtn')?.addEventListener('click', () => this.goToday());

    const gridEl = $('calGrid');
    if (!gridEl) return;

    gridEl.addEventListener('click', (e) => {
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
        this.addingDateKey = key; // pozostaw otwarte do szybkiego wpisania kolejnego lub zamknij Esc
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
