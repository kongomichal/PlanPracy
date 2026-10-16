/* Moduł "Godziny": szybki formularz dodawania godzin oraz automatyczne podsumowanie z edycją i usuwaniem */
const Hours = {
  /** Zbiera dane ze wszystkich dni: osoba -> projekt -> dni. Prace przeniesione na inny dzień są pomijane. */
  collect() {
    const keys = Object.keys(Store.data).sort();
    const people = {};

    keys.forEach(key => {
      Store.get(key).jobs.forEach((job, jobIndex) => {
        if (job.status === 'moved') return;
        const project = job.place || 'Bez projektu';
        job.people.forEach((p, personIndex) => {
          const { hours, real } = personHours(p);
          const person = people[p.name] = people[p.name] || { total: 0, projects: {} };
          const proj = person.projects[project] = person.projects[project] || { total: 0, lines: [] };
          person.total += hours;
          proj.total += hours;
          proj.lines.push({
            key,
            jobIndex,
            personIndex,
            note: p.note || '',
            hours,
            real
          });
        });
      });
    });
    return people;
  },

  sortedNames(people) {
    return Object.keys(people).sort((a, b) => a.localeCompare(b, 'pl'));
  },

  lineLabel(l) {
    const d = parseKey(l.key);
    return `${DAYS_SHORT[d.getDay()]} ${shortDate(d)}.${d.getFullYear()}`;
  },

  totalSum() {
    let sum = 0;
    Object.values(Store.data).forEach(day => {
      day.jobs.forEach(job => {
        if (job.status === 'moved') return;
        job.people.forEach(p => {
          sum += personHours(p).hours;
        });
      });
    });
    return sum;
  },

  recalcQuick() {
    const from = $('qhFrom')?.value;
    const to = $('qhTo')?.value;
    if ($('qhCalculated')) {
      $('qhCalculated').textContent = fmtHours(hoursBetween(from, to));
    }
  },

  submitQuick() {
    const date = $('qhDate')?.value;
    const name = $('qhName')?.value.trim();
    const from = $('qhFrom')?.value;
    const to = $('qhTo')?.value;
    const project = $('qhProject')?.value.trim();
    const note = $('qhNote')?.value.trim() || '';

    if (!date || !name || !from || !to) {
      return toast('Wypełnij wymagane pola (data, imię, od, do)');
    }

    const ok = Store.addHoursEntry({ date, name, from, to, project, note });
    if (ok) {
      App.render();
      toast(`Zapisano ${fmtHours(hoursBetween(from, to))} dla ${name}`);
      $('qhName').value = '';
      $('qhProject').value = '';
      if ($('qhNote')) $('qhNote').value = '';
      $('qhName').focus();
    }
  },

  /* ---------- Edycja i usuwanie wpisów godzin ---------- */
  openEditModal(key, jobIndex, personIndex) {
    const day = Store.get(key);
    const job = day.jobs[jobIndex];
    if (!job) return;
    const person = job.people[personIndex];
    if (!person) return;

    if ($('ehKey')) $('ehKey').value = key;
    if ($('ehJobIndex')) $('ehJobIndex').value = jobIndex;
    if ($('ehPersonIndex')) $('ehPersonIndex').value = personIndex;

    if ($('ehDate')) $('ehDate').value = key;
    if ($('ehName')) $('ehName').value = person.name || '';
    if ($('ehFrom')) $('ehFrom').value = person.realFrom || person.from || '07:00';
    if ($('ehTo')) $('ehTo').value = person.realTo || person.to || '15:30';
    if ($('ehProject')) $('ehProject').value = job.place || '';
    if ($('ehNote')) $('ehNote').value = person.note || '';

    this.recalcEditHours();
    openModal('editHoursModal');
    setTimeout(() => $('ehFrom')?.focus(), 50);
  },

  recalcEditHours() {
    const from = $('ehFrom')?.value;
    const to = $('ehTo')?.value;
    if ($('ehCalculated')) {
      $('ehCalculated').textContent = fmtHours(hoursBetween(from, to));
    }
  },

  saveEditModal() {
    const origKey = $('ehKey')?.value;
    const jobIndex = Number($('ehJobIndex')?.value);
    const personIndex = Number($('ehPersonIndex')?.value);

    const newDate = $('ehDate')?.value;
    const newName = $('ehName')?.value.trim();
    const newFrom = $('ehFrom')?.value;
    const newTo = $('ehTo')?.value;
    const newProject = $('ehProject')?.value.trim();
    const newNote = $('ehNote')?.value.trim() || '';

    if (!newDate || !newName || !newFrom || !newTo) {
      return toast('Wypełnij wszystkie wymagane pola');
    }

    const origDay = Store.get(origKey);
    const origJob = origDay.jobs[jobIndex];
    if (!origJob || !origJob.people[personIndex]) return;

    if (newDate === origKey) {
      const person = origJob.people[personIndex];
      person.name = newName;
      person.from = newFrom;
      person.to = newTo;
      person.realFrom = newFrom;
      person.realTo = newTo;
      person.note = newNote;
      if (newProject) origJob.place = newProject;
      Store.set(origKey, origDay);
    } else {
      origJob.people.splice(personIndex, 1);
      Store.set(origKey, origDay);
      Store.addHoursEntry({
        date: newDate,
        name: newName,
        from: newFrom,
        to: newTo,
        project: newProject || origJob.place,
        note: newNote
      });
    }

    closeModal('editHoursModal');
    App.render();
    toast(`Zaktualizowano godziny dla ${newName}`);
  },

  deleteEntry(key, jobIndex, personIndex) {
    const day = Store.get(key);
    const job = day.jobs[jobIndex];
    if (!job || !job.people[personIndex]) return;
    const personName = job.people[personIndex].name;

    if (!confirm(`Czy na pewno usunąć godziny dla: ${personName}?`)) return;

    job.people.splice(personIndex, 1);
    Store.set(key, day);
    closeModal('editHoursModal');
    App.render();
    toast(`Usunięto godziny dla ${personName}`);
  },

  render() {
    const people = this.collect();
    const names = this.sortedNames(people);
    const box = $('hoursList');

    if (box) {
      if (!names.length) {
        box.innerHTML = '<div class="empty-state">Brak wprowadzonych godzin. Dodaj godziny w formularzu powyżej. 👍</div>';
      } else {
        box.innerHTML = names.map(name => {
          const person = people[name];
          return `
            <section class="h-person">
              <div class="h-person-head"><span>${esc(name)}</span><span>${fmtHours(person.total)}</span></div>
              ${Object.keys(person.projects).sort((a, b) => a.localeCompare(b, 'pl')).map(pn => {
                const proj = person.projects[pn];
                return `
                  <div class="h-project"><span>${esc(pn)}</span><span>${fmtHours(proj.total)}</span></div>
                  ${proj.lines.map(l => `
                    <div class="h-line">
                      <span class="h-line-desc">${this.lineLabel(l)}${l.note ? ' · <span class="h-note">' + esc(l.note) + '</span>' : ''}${l.real ? '' : '<span class="h-plan">plan</span>'}</span>
                      <div class="h-line-right">
                        <span class="h-line-val">${fmtHours(l.hours)}</span>
                        <div class="h-line-actions">
                          <button type="button" class="btn small icon h-btn" data-edit-hours="${l.key}" data-job="${l.jobIndex}" data-person="${l.personIndex}" title="Edytuj te godziny">✏️</button>
                          <button type="button" class="btn small icon danger h-btn" data-delete-hours="${l.key}" data-job="${l.jobIndex}" data-person="${l.personIndex}" title="Usuń te godziny">🗑️</button>
                        </div>
                      </div>
                    </div>`).join('')}`;
              }).join('')}
            </section>`;
        }).join('');
      }
    }

    const totalEl = $('hoursTotalSumBadge');
    if (totalEl) {
      totalEl.textContent = fmtHours(this.totalSum());
    }
  },

  copyText() {
    const people = this.collect();
    const names = this.sortedNames(people);
    if (!names.length) { toast('Brak godzin do skopiowania'); return; }

    const text = names.map(name => {
      const person = people[name];
      const projects = Object.keys(person.projects).sort((a, b) => a.localeCompare(b, 'pl')).map(pn => {
        const proj = person.projects[pn];
        const lines = proj.lines.map(l => `    ${this.lineLabel(l)}: ${fmtHours(l.hours)}${l.note ? ' · ' + l.note : ''}${l.real ? '' : ' (plan)'}`).join('\n');
        return `  ${pn} – ${fmtHours(proj.total)}\n${lines}`;
      }).join('\n');
      return `${name} – RAZEM ${fmtHours(person.total)}\n${projects}`;
    }).join('\n\n');

    navigator.clipboard.writeText(text)
      .then(() => toast('Skopiowano podsumowanie godzin'))
      .catch(() => prompt('Skopiuj tekst:', text));
  },

  init() {
    $('copyHoursBtn')?.addEventListener('click', () => this.copyText());

    if ($('qhDate') && !$('qhDate').value) {
      $('qhDate').value = dateKey(new Date());
    }

    $('qhFrom')?.addEventListener('input', () => this.recalcQuick());
    $('qhTo')?.addEventListener('input', () => this.recalcQuick());
    this.recalcQuick();

    $('quickHoursForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitQuick();
    });

    $('hoursList')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-hours]');
      if (editBtn) {
        return this.openEditModal(editBtn.dataset.editHours, Number(editBtn.dataset.job), Number(editBtn.dataset.person));
      }
      const delBtn = e.target.closest('[data-delete-hours]');
      if (delBtn) {
        return this.deleteEntry(delBtn.dataset.deleteHours, Number(delBtn.dataset.job), Number(delBtn.dataset.person));
      }
    });

    $('ehFrom')?.addEventListener('input', () => this.recalcEditHours());
    $('ehTo')?.addEventListener('input', () => this.recalcEditHours());

    $('editHoursForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveEditModal();
    });

    $('ehDeleteBtn')?.addEventListener('click', () => {
      const origKey = $('ehKey')?.value;
      const jobIndex = Number($('ehJobIndex')?.value);
      const personIndex = Number($('ehPersonIndex')?.value);
      this.deleteEntry(origKey, jobIndex, personIndex);
    });
  }
};
