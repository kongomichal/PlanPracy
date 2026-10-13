/* Panel zlecenia: podgląd tylko do odczytu (+ wpisywanie realnych godzin) i karta po najechaniu */
const JobView = {
  key: null,
  index: 0,
  hoverEl: null,

  job(key, index) {
    return Store.get(key).jobs[index];
  },

  /** HTML zlecenia. interactive=true -> pola na realne godziny; false -> sam tekst (karta hover). */
  details(key, index, interactive) {
    const job = this.job(key, index);
    if (!job) return '';

    const people = job.people.length ? `
      ${interactive ? `<div class="rh-row rh-head"><span>Osoba</span><span>Plan</span><span>Faktycznie od</span><span>do</span><span></span></div>` : ''}
      ${job.people.map((p, i) => {
        const ph = personHours(p);
        const planned = `${p.from}–${p.to}`;
        if (!interactive) {
          return `<div class="rh-row"><span><b>${esc(p.name)}</b> <span class="muted">plan ${planned}</span></span>
            <span>${p.realFrom && p.realTo ? `<b>${p.realFrom}–${p.realTo} (${fmtHours(ph.hours)})</b>` : '<span class="muted">brak rzeczywistych</span>'}</span></div>`;
        }
        return `<div class="rh-row" data-p="${i}">
          <span class="rh-name"><b>${esc(p.name)}</b></span>
          <span class="muted">${planned}</span>
          <input type="time" class="r-from" value="${esc(p.realFrom || '')}" aria-label="Rzeczywiste od">
          <input type="time" class="r-to" value="${esc(p.realTo || '')}" aria-label="Rzeczywiste do">
          <span class="r-h">${p.realFrom && p.realTo ? fmtHours(ph.hours) : '–'}</span>
        </div>`;
      }).join('')}` : '<span class="muted">Nikt nie jest przypisany</span>';

    const items = job.items.length
      ? job.items.map(i => `<div class="view-item ${i.done ? 'done' : ''}">${i.done ? '✅' : '⬜'} <span class="tag t-${i.type}">${ITEM_TYPES[i.type] || 'Inne'}</span> ${esc(i.text)}</div>`).join('')
      : '<span class="muted">Nic nie trzeba zabierać</span>';

    const tasks = Array.isArray(job.tasks) && job.tasks.length
      ? job.tasks
      : (job.goal ? Store.parseGoalToTasks(job.goal) : []);

    const tasksHtml = tasks.length ? `
      <div class="job-tasks">
        ${tasks.map(t => `
          <div class="job-task">
            <div class="task-title"><b>${esc(t.title)}</b></div>
            ${t.subtasks && t.subtasks.length ? `
              <ul class="task-subtasks">
                ${t.subtasks.map(st => `<li>${esc(st)}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>
    ` : `<div class="view-text">${esc(job.goal) || '—'}</div>`;

    return `
      <div class="view-sec">
        <span class="badge s-${job.status}">${STATUS[job.status]}</span>
        <div class="view-big">${esc(job.place) || 'Bez projektu'}</div>
      </div>
      <div class="view-sec"><h3>Zadania</h3>${tasksHtml}</div>
      <div class="view-sec"><h3>Ekipa i godziny</h3>${people}</div>
      <div class="view-sec"><h3>Do zabrania</h3>${items}</div>
      ${job.result ? `<div class="view-sec"><h3>Co zrobiono</h3><div class="view-text">${esc(job.result)}</div></div>` : ''}`;
  },

  /* ---------- panel (klik) ---------- */
  open(key, index) {
    if (!this.job(key, index)) return this.hide(), DayEditor.open(key);
    this.hide();
    this.key = key;
    this.index = index;
    $('jobViewTitle').textContent = longDate(parseKey(key));
    $('jobViewBody').innerHTML = this.details(key, index, true);
    openModal('jobModal');
  },

  recalcRow(row) {
    const from = row.querySelector('.r-from').value, to = row.querySelector('.r-to').value;
    row.querySelector('.r-h').textContent = from && to ? fmtHours(hoursBetween(from, to)) : '–';
  },

  fillFromPlan() {
    const job = this.job(this.key, this.index);
    document.querySelectorAll('#jobViewBody .rh-row[data-p]').forEach(row => {
      const p = job.people[Number(row.dataset.p)];
      const f = row.querySelector('.r-from'), t = row.querySelector('.r-to');
      if (!f.value) f.value = p.from;
      if (!t.value) t.value = p.to;
      this.recalcRow(row);
    });
  },

  save() {
    const day = Store.get(this.key);
    const job = day.jobs[this.index];
    document.querySelectorAll('#jobViewBody .rh-row[data-p]').forEach(row => {
      const p = job.people[Number(row.dataset.p)];
      p.realFrom = row.querySelector('.r-from').value;
      p.realTo = row.querySelector('.r-to').value;
    });
    Store.set(this.key, day);
    closeModal('jobModal');
    App.render();
    toast('Godziny zapisane');
  },

  /* ---------- karta po najechaniu ---------- */
  show(el) {
    const card = el.closest('.day');
    if (!card) return;
    const html = this.details(card.dataset.date, Number(el.dataset.job), false);
    if (!html) return;

    const box = $('hoverCard');
    box.innerHTML = html;
    box.hidden = false;

    const r = el.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    let left = r.right + 10;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 10);
    let top = Math.min(Math.max(8, r.top), window.innerHeight - h - 8);
    box.style.left = `${left}px`;
    box.style.top = `${Math.max(8, top)}px`;
    this.hoverEl = el;
  },

  hide() {
    $('hoverCard').hidden = true;
    this.hoverEl = null;
  },

  init() {
    $('jobViewEditBtn').addEventListener('click', () => {
      const key = this.key, index = this.index;
      closeModal('jobModal');
      DayEditor.open(key, false, index);
    });
    $('jobViewFillBtn').addEventListener('click', () => this.fillFromPlan());
    $('jobViewSaveBtn').addEventListener('click', () => this.save());
    $('jobViewBody').addEventListener('input', (e) => {
      const row = e.target.closest('.rh-row[data-p]');
      if (row) this.recalcRow(row);
    });

    if (window.matchMedia('(hover: hover)').matches) {
      const plan = $('view-plan');
      plan.addEventListener('mouseover', (e) => {
        const job = e.target.closest('.job');
        if (job && job !== this.hoverEl) this.show(job);
        if (!job) this.hide();
      });
      plan.addEventListener('mouseleave', () => this.hide());
      window.addEventListener('scroll', () => this.hide(), true);
    }
  }
};
