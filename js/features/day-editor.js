/* Okno edycji jednego dnia – dzień może mieć kilka prac (zakładki) */
const DayEditor = {
  key: null,
  jobs: [],
  current: 0,

  open(key, showMove = false, jobIndex = 0) {
    this.key = key;
    this.jobs = JSON.parse(JSON.stringify(Store.get(key).jobs));
    if (!this.jobs.length) this.jobs.push(Store.emptyJob());
    this.current = Math.min(jobIndex, this.jobs.length - 1);

    $('dayTitle').textContent = longDate(parseKey(key));
    this.fillMoveTargets();
    this.loadJob();
    $('movePanel').hidden = !showMove;
    openModal('dayModal');
    if (!showMove) setTimeout(() => $('fGoal').focus(), 50);
  },

  close() { closeModal('dayModal'); this.key = null; },

  /* ---------- zakładki prac ---------- */
  renderTabs() {
    const tabs = this.jobs.map((j, i) => {
      const label = j.goal ? j.goal : 'Nowa praca';
      return `<button type="button" class="job-tab ${i === this.current ? 'active' : ''}" data-tab="${i}">${i + 1}. ${esc(label)}</button>`;
    }).join('');
    $('jobTabs').innerHTML = tabs + '<button type="button" class="job-tab add" data-add-job>+ Praca</button>';
    $('removeJobBtn').hidden = this.jobs.length < 2 && !Store.jobHasContent(this.collect());
  },

  switchTo(index) {
    this.jobs[this.current] = this.collect();
    this.current = index;
    this.loadJob();
  },

  addJob() {
    this.jobs[this.current] = this.collect();
    this.jobs.push(Store.emptyJob());
    this.current = this.jobs.length - 1;
    this.loadJob();
    $('fPlace').focus();
  },

  removeJob() {
    if (!confirm('Usunąć tę pracę?')) return;
    this.jobs.splice(this.current, 1);
    if (!this.jobs.length) this.jobs.push(Store.emptyJob());
    this.current = Math.min(this.current, this.jobs.length - 1);
    this.loadJob();
  },

  /* ---------- formularz jednej pracy ---------- */
  loadJob() {
    const job = this.jobs[this.current];
    $('fPlace').value = job.place;
    $('fGoal').value = job.goal;
    $('fResult').value = job.result;
    const radio = document.querySelector(`input[name="fStatus"][value="${job.status === 'moved' ? 'notdone' : job.status}"]`);
    if (radio) radio.checked = true;

    $('peopleRows').innerHTML = '';
    job.people.forEach(p => this.addPerson(p));
    $('itemRows').innerHTML = '';
    job.items.forEach(i => this.addItem(i));
    this.recalc();
    this.renderTabs();
  },

  addPerson(p = { name: '', from: '07:00', to: '15:30' }) {
    const row = document.createElement('div');
    row.className = 'person-row';
    row.dataset.realFrom = p.realFrom || '';
    row.dataset.realTo = p.realTo || '';
    row.innerHTML = `
      <input type="text" class="p-name" list="peopleNames" placeholder="Imię i nazwisko" value="${esc(p.name)}">
      <input type="time" class="p-from" value="${esc(p.from)}" aria-label="Od">
      <input type="time" class="p-to" value="${esc(p.to)}" aria-label="Do">
      <button type="button" class="btn small icon" data-remove aria-label="Usuń osobę">✕</button>`;
    $('peopleRows').appendChild(row);
  },

  addItem(i = { type: 'tool', text: '', done: false }) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const options = Object.entries(ITEM_TYPES)
      .map(([k, v]) => `<option value="${k}" ${k === i.type ? 'selected' : ''}>${v}</option>`).join('');
    row.innerHTML = `
      <input type="checkbox" class="i-done" ${i.done ? 'checked' : ''} aria-label="Załatwione">
      <select class="i-type">${options}</select>
      <input type="text" class="i-text" placeholder="Co dokładnie?" value="${esc(i.text)}">
      <button type="button" class="btn small icon" data-remove aria-label="Usuń rzecz">✕</button>`;
    $('itemRows').appendChild(row);
  },

  recalc() {
    let total = 0;
    document.querySelectorAll('#peopleRows .person-row').forEach(r => {
      total += hoursBetween(r.querySelector('.p-from').value, r.querySelector('.p-to').value);
    });
    $('hoursTotal').textContent = fmtHours(total);
  },

  /** Odczyt formularza -> obiekt jednej pracy. */
  collect() {
    const people = [...document.querySelectorAll('#peopleRows .person-row')]
      .map(r => ({
        name: r.querySelector('.p-name').value.trim(),
        from: r.querySelector('.p-from').value,
        to: r.querySelector('.p-to').value,
        realFrom: r.dataset.realFrom || '',
        realTo: r.dataset.realTo || ''
      }))
      .filter(p => p.name);

    const items = [...document.querySelectorAll('#itemRows .item-row')]
      .map(r => ({
        type: r.querySelector('.i-type').value,
        text: r.querySelector('.i-text').value.trim(),
        done: r.querySelector('.i-done').checked
      }))
      .filter(i => i.text);

    return {
      place: $('fPlace').value.trim(),
      goal: $('fGoal').value.trim(),
      status: document.querySelector('input[name="fStatus"]:checked').value,
      people, items,
      result: $('fResult').value.trim()
    };
  },

  /** Zapisuje wszystkie prace dnia (puste pomija). */
  save() {
    if (!this.key) return;
    this.jobs[this.current] = this.collect();
    const jobs = this.jobs.filter(j => Store.jobHasContent(j));
    Store.set(this.key, { date: this.key, jobs });
    this.close();
    App.render();
    toast('Zapisano');
  },

  fillMoveTargets() {
    $('moveTarget').innerHTML = Plan.keys()
      .filter(k => k !== this.key)
      .map(k => `<option value="${k}">${longDate(parseKey(k))}</option>`).join('');
  },

  /** Przenosi bieżącą pracę (cel, ekipa, rzeczy) na inny dzień. */
  move() {
    const targetKey = $('moveTarget').value;
    if (!targetKey || !this.key) return;

    const job = this.collect();
    this.jobs[this.current] = job;
    if (!Store.jobHasContent(job)) { toast('Ta praca jest pusta'); return; }

    const target = Store.get(targetKey);
    target.jobs.push({
      ...job, status: 'plan', result: '',
      items: job.items.map(i => ({ ...i, done: false }))
    });
    Store.set(targetKey, target);

    job.status = 'moved';
    job.result = `${job.result ? job.result + ' ' : ''}(przeniesiono na ${shortDate(parseKey(targetKey))})`;
    Store.set(this.key, { date: this.key, jobs: this.jobs.filter(j => Store.jobHasContent(j)) });

    this.close();
    App.render();
    toast(`Przeniesiono na ${shortDate(parseKey(targetKey))}`);
  },

  init() {
    $('addPersonBtn').addEventListener('click', () => this.addPerson());
    $('addItemBtn').addEventListener('click', () => this.addItem());
    $('saveDayBtn').addEventListener('click', () => this.save());
    $('removeJobBtn').addEventListener('click', () => this.removeJob());
    $('moveToggleBtn').addEventListener('click', () => { $('movePanel').hidden = !$('movePanel').hidden; });
    $('moveConfirmBtn').addEventListener('click', () => this.move());

    $('jobTabs').addEventListener('click', (e) => {
      if (e.target.closest('[data-add-job]')) return this.addJob();
      const tab = e.target.closest('[data-tab]');
      if (tab) this.switchTo(Number(tab.dataset.tab));
    });

    $('peopleRows').addEventListener('input', () => this.recalc());
    ['peopleRows', 'itemRows'].forEach(id => {
      $(id).addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove]');
        if (btn) { btn.parentElement.remove(); this.recalc(); }
      });
    });

    // Podpowiedzi imion z już wpisanych osób
    const list = document.createElement('datalist');
    list.id = 'peopleNames';
    document.body.appendChild(list);
  },

  refreshNameSuggestions() {
    const names = new Set();
    Object.values(Store.data).forEach(d => d.jobs.forEach(j => j.people.forEach(p => names.add(p.name))));
    $('peopleNames').innerHTML = [...names].map(n => `<option value="${esc(n)}">`).join('');
  }
};
