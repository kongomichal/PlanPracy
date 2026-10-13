/* Zakładka "Plan": 14 kart dni, każda z listą prac */
const Plan = {
  start: mondayOf(),

  shift(days) { this.start = addDays(this.start, days); },
  goToday() { this.start = mondayOf(); },

  render() {
    const end = addDays(this.start, 13);
    $('rangeLabel').textContent = `${shortDate(this.start)} – ${shortDate(end)}.${end.getFullYear()}`;

    const w1 = [], w2 = [];
    for (let i = 0; i < 14; i++) {
      (i < 7 ? w1 : w2).push(this.cardHtml(addDays(this.start, i)));
    }
    $('week1').innerHTML = w1.join('');
    $('week2').innerHTML = w2.join('');
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
        ${problem ? `<button class="btn small" data-move="${key}" data-job-move="${index}">Przenieś</button>` : ''}
      </div>`;
  },


  cardHtml(date) {
    const key = dateKey(date);
    const day = Store.get(key);
    const isToday = dateKey(new Date()) === key;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const classes = ['day', isToday ? 'today' : '', isWeekend ? 'weekend' : ''].join(' ');

    const body = day.jobs.length
      ? day.jobs.map((j, i) => this.jobHtml(key, j, i)).join('')
      : '<div class="day-empty">+ Dodaj plan</div>';

    return `
      <article class="${classes}" data-date="${key}">
        <div class="day-top">
          <div class="day-date"><b>${DAYS_SHORT[date.getDay()]}</b> ${shortDate(date)}${isToday ? ' · dziś' : ''}</div>
          <div class="row">
            ${day.jobs.length > 1 ? `<span class="muted small">${day.jobs.length} ${plural(day.jobs.length, 'praca', 'prace', 'prac')}</span>` : ''}
            <button class="btn small" data-edit="${key}">${day.jobs.length ? '✏️ Edytuj' : '+ Dodaj'}</button>
          </div>
        </div>
        ${body}
      </article>`;
  },

  /** Wszystkie 14 dni jako lista kluczy (do list rozwijanych). */
  keys() {
    return Array.from({ length: 14 }, (_, i) => dateKey(addDays(this.start, i)));
  }
};
