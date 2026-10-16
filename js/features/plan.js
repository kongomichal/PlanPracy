/* Zakładka "Plan": 14 kart dni z listą prac. Płynnie przesuwający się harmonogram z odklikiwaniem minionych dni. */
const Plan = {
  pageOffset: 0,
  showDismissed: false,

  shift(days) {
    this.pageOffset += days;
  },

  goToday() {
    this.pageOffset = 0;
  },

  /** Znajduje pierwszy aktywny dzień od którego zaczyna się widok. */
  getFirstActiveDay() {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let earliest = mondayOf(todayMidnight);

    Object.entries(Store.data).forEach(([key, day]) => {
      if (day.jobs && day.jobs.length > 0 && !Store.isDismissed(key)) {
        const d = parseKey(key);
        if (d < earliest) earliest = d;
      }
    });

    if (this.showDismissed) {
      return earliest;
    }

    let curr = new Date(earliest);
    let guard = 0;
    while (guard < 1000) {
      guard++;
      const key = dateKey(curr);
      if (!Store.isDismissed(key)) {
        return curr;
      }
      curr = addDays(curr, 1);
    }
    return earliest;
  },

  /** Zwraca 14 dni dla bieżącego widoku (z uwzględnieniem odklikiwania i przewijania). */
  getDays() {
    const firstActive = this.getFirstActiveDay();

    if (this.pageOffset < 0) {
      const days = [];
      const start = addDays(firstActive, this.pageOffset);
      for (let i = 0; i < 14; i++) {
        days.push(addDays(start, i));
      }
      return days;
    }

    const activeDays = [];
    const neededCount = this.pageOffset + 14;
    let curr = new Date(firstActive);
    let guard = 0;

    while (activeDays.length < neededCount && guard < 1000) {
      guard++;
      const key = dateKey(curr);
      const isDismissed = Store.isDismissed(key);
      if (this.showDismissed || !isDismissed) {
        activeDays.push(new Date(curr));
      }
      curr = addDays(curr, 1);
    }

    return activeDays.slice(this.pageOffset, this.pageOffset + 14);
  },

  /** Wszystkie 14 aktualnie widocznych dni jako lista kluczy. */
  keys() {
    return this.getDays().map(d => dateKey(d));
  },

  /** Klucze najbliższych 28 aktywnych dni (do przenoszenia prac nawet na za 4 tygodnie). */
  moveTargetKeys() {
    const firstActive = this.getFirstActiveDay();
    const keys = [];
    let curr = new Date(firstActive);
    let guard = 0;
    while (keys.length < 28 && guard < 1000) {
      guard++;
      const k = dateKey(curr);
      if (!Store.isDismissed(k)) {
        keys.push(k);
      }
      curr = addDays(curr, 1);
    }
    return keys;
  },

  /** Zwraca minione dni obecne w bieżącym widoku, które nie zostały jeszcze odkliknięte. */
  getVisiblePastDays() {
    const todayKey = dateKey(new Date());
    const past = [];
    this.getDays().forEach(d => {
      const k = dateKey(d);
      if (k < todayKey && !Store.isDismissed(k)) {
        past.push(k);
      }
    });
    return past;
  },

  dismissDay(key) {
    Store.setDismissed(key, true);
    App.render();
    const d = parseKey(key);
    toast(`Odkliknięto dzień ${DAYS_SHORT[d.getDay()]} ${shortDate(d)}`, 'Cofnij', () => this.restoreDay(key));
  },

  restoreDay(key) {
    Store.setDismissed(key, false);
    App.render();
    const d = parseKey(key);
    toast(`Przywrócono dzień ${DAYS_SHORT[d.getDay()]} ${shortDate(d)}`);
  },

  dismissAllPast() {
    const pastKeys = this.getVisiblePastDays();
    if (!pastKeys.length) return toast('Brak minionych dni do odkliknięcia');
    pastKeys.forEach(k => Store.setDismissed(k, true));
    App.render();
    toast(`Odkliknięto minione dni (${pastKeys.length})`, 'Cofnij', () => {
      pastKeys.forEach(k => Store.setDismissed(k, false));
      App.render();
    });
  },

  render() {
    const days = this.getDays();
    if (!days.length) return;

    const start = days[0];
    const end = days[days.length - 1];
    $('rangeLabel').textContent = `${shortDate(start)} – ${shortDate(end)}.${end.getFullYear()}`;

    const w1 = [], w2 = [];
    for (let i = 0; i < days.length; i++) {
      (i < 7 ? w1 : w2).push(this.cardHtml(days[i]));
    }
    $('week1').innerHTML = w1.join('');
    $('week2').innerHTML = w2.join('');

    // Dynamiczne tytuły tygodni
    if ($('week1Title') && days.length >= 7) {
      $('week1Title').textContent = `Tydzień 1 · ${shortDate(days[0])} – ${shortDate(days[6])}`;
    }
    if ($('week2Title') && days.length >= 14) {
      $('week2Title').textContent = `Tydzień 2 · ${shortDate(days[7])} – ${shortDate(days[13])}`;
    }

    // Pasek narzędzi
    const pastUnDismissed = this.getVisiblePastDays();
    if ($('pastDaysCount')) $('pastDaysCount').textContent = pastUnDismissed.length;
    if ($('dismissPastBtn')) $('dismissPastBtn').hidden = pastUnDismissed.length === 0;

    const dismissedTotal = Object.values(Store.data).filter(d => d.dismissed).length;
    if ($('dismissedTotalCount')) $('dismissedTotalCount').textContent = dismissedTotal;
    if ($('showDismissedToggle')) $('showDismissedToggle').checked = this.showDismissed;
  },

  jobHtml(key, job, index) {
    const problem = job.status === 'notdone' || job.status === 'partial';
    const hours = job.people.reduce((s, p) => s + hoursBetween(p.from, p.to), 0);
    const todo = job.items.filter(i => !i.done).length;

    // Projekt i zadania – zawsze w całości bez obcinania
    const chips = [
      job.status !== 'plan' ? `<span class="badge s-${job.status}">${STATUS[job.status]}</span>` : '',
      `<span class="chip" title="Liczba osób i godzin">👷 ${job.people.length} · ${fmtHours(hours)}</span>`,
      todo ? `<span class="chip alert" title="Rzeczy do załatwienia">⚠ ${todo} do zabrania</span>` : ''
    ].filter(Boolean).join('');

    const tasks = Array.isArray(job.tasks) && job.tasks.length
      ? job.tasks
      : (job.goal ? Store.parseGoalToTasks(job.goal) : []);

    const tasksHtml = tasks.length
      ? `<div class="job-tasks">
          ${tasks.map(t => `
            <div class="job-task">
              <div class="task-title">${esc(t.title)}</div>
              ${t.subtasks && t.subtasks.length ? `
                <ul class="task-subtasks">
                  ${t.subtasks.map(st => `<li>${esc(st)}</li>`).join('')}
                </ul>
              ` : ''}
            </div>
          `).join('')}
        </div>`
      : `<div class="job-goal muted">Brak zadań</div>`;

    return `
      <div class="job ${problem ? 'problem' : ''}" data-job="${index}">
        <div class="job-project">${esc(job.place) || '<span class="muted">Bez projektu</span>'}</div>
        ${tasksHtml}
        <div class="chips">${chips}</div>
        ${problem ? `<button type="button" class="btn small" data-move="${key}" data-job-move="${index}">Przenieś</button>` : ''}
      </div>`;
  },

  cardHtml(date) {
    const key = dateKey(date);
    const day = Store.get(key);
    const todayKey = dateKey(new Date());
    const isToday = todayKey === key;
    const isPast = key < todayKey;
    const isDismissed = Store.isDismissed(key);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const classes = [
      'day',
      isToday ? 'today' : '',
      isWeekend ? 'weekend' : '',
      isPast ? 'past' : '',
      isDismissed ? 'dismissed' : ''
    ].filter(Boolean).join(' ');

    const body = day.jobs.length
      ? day.jobs.map((j, i) => this.jobHtml(key, j, i)).join('')
      : `<div class="day-empty" data-edit="${key}">+ Dodaj plan</div>`;

    let actionBtn = '';
    if (isDismissed) {
      actionBtn = `<button type="button" class="btn small restore-btn" data-restore="${key}" title="Przywróć ten dzień na listę">↩ Przywróć</button>`;
    } else if (isPast) {
      actionBtn = `<button type="button" class="btn small dismiss-btn" data-dismiss="${key}" title="Odkliknij dzień (minął – zniknie z listy, a na końcu wskoczy kolejny)">✓ Odkliknij</button>`;
    } else {
      actionBtn = `<button type="button" class="btn-check-icon" data-dismiss="${key}" title="Odkliknij dzień (zniknie z listy)">✓</button>`;
    }

    return `
      <article class="${classes}" data-date="${key}">
        <div class="day-top">
          <div class="day-date">
            ${isDismissed ? '<span class="dismissed-badge">Odkliknięty</span>' : ''}
            <b>${DAYS_SHORT[date.getDay()]}</b> ${shortDate(date)}${isToday ? ' · dziś' : ''}
          </div>
          <div class="row">
            ${actionBtn}
            ${day.jobs.length > 1 ? `<span class="muted small">${day.jobs.length} ${plural(day.jobs.length, 'praca', 'prace', 'prac')}</span>` : ''}
            <button type="button" class="btn small" data-edit="${key}">${day.jobs.length ? '✏️ Edytuj' : '+ Dodaj'}</button>
          </div>
        </div>
        ${body}
      </article>`;
  },

  init() {
    const dismissAll = $('dismissPastBtn');
    if (dismissAll) {
      dismissAll.addEventListener('click', () => this.dismissAllPast());
    }
    const showToggle = $('showDismissedToggle');
    if (showToggle) {
      showToggle.addEventListener('change', (e) => {
        this.showDismissed = e.target.checked;
        App.render();
      });
    }
  }
};
