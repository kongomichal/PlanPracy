/* Moduł "Godziny" / "Ewidencja RBH": rejestr zgodny z Panelem Muraven, szybki formularz oraz eksport do bazy JSON */
const Hours = {
  activeView: 'register', // 'register' (Tabela RBH) | 'summary' (Karty projektowe)
  filterYear: 'ALL',
  filterMonth: 'ALL',
  filterEmployee: 'ALL',
  filterProject: 'ALL',

  /** Zbiera dane w strukturze: osoba -> projekt -> wpisy (dla widoku kart). */
  collect() {
    const keys = Object.keys(Store.data).sort();
    const people = {};

    keys.forEach(key => {
      Store.get(key).jobs.forEach((job, jobIndex) => {
        if (job.status === 'moved') return;
        const project = (job.place || 'Prace ogólne').trim();
        job.people.forEach((p, personIndex) => {
          if (!p.name) return;
          const { hours, real } = personHours(p);
          const person = people[p.name] = people[p.name] || { total: 0, projects: {} };
          const proj = person.projects[project] = person.projects[project] || { total: 0, lines: [] };
          person.total += hours;
          proj.total += hours;
          const from = real ? (p.realFrom || p.from) : (p.from || p.realFrom);
          const to = real ? (p.realTo || p.to) : (p.to || p.realTo);
          proj.lines.push({
            key,
            jobIndex,
            personIndex,
            note: p.note || '',
            hours,
            real,
            from: from || '',
            to: to || ''
          });
        });
      });
    });
    return people;
  },

  /** Zbiera płaską listę wpisów w 100% zgodną z kolekcją workLog w Panelu Muraven (najnowsze pierwsze). */
  collectFlat() {
    const list = [];
    const keys = Object.keys(Store.data).sort().reverse();
    let counter = 0;

    keys.forEach(date => {
      const day = Store.get(date);
      if (!day || !day.jobs) return;

      day.jobs.forEach((job, jobIndex) => {
        if (job.status === 'moved') return;
        const project = (job.place || 'Prace ogólne').trim();

        (job.people || []).forEach((p, personIndex) => {
          if (!p.name) return;
          const ph = personHours(p);
          const from = ph.real ? (p.realFrom || p.from) : (p.from || p.realFrom);
          const to = ph.real ? (p.realTo || p.to) : (p.to || p.realTo);
          const sT = from || '07:00';
          const eT = to || '15:30';
          const timeRange = `${sT} - ${eT}`;

          counter++;
          list.push({
            id: p.id || `wl-${date.replace(/-/g, '')}-${jobIndex}-${personIndex}-${counter}`,
            date: date,
            employee: p.name.trim(),
            project: project,
            notes: (p.note || '').trim(),
            timeRange: timeRange,
            totalHours: ph.hours,
            real: ph.real,
            jobIndex,
            personIndex
          });
        });
      });
    });

    return list;
  },

  timeRange(l) {
    if (l.from && l.to) return `${l.from} – ${l.to}`;
    if (l.from) return `od ${l.from}`;
    if (l.to) return `do ${l.to}`;
    return '';
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
      return toast('Wypełnij wymagane pola (data, pracownik, od, do)');
    }

    const ok = Store.addHoursEntry({ date, name, from, to, project, note });
    if (ok) {
      App.render();
      toast(`Zapisano ${fmtHours(hoursBetween(from, to))} dla ${name}`);

      // Wizualny feedback na przycisku
      const btn = $('qhSubmitBtn');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Zapisano!';
        btn.style.backgroundColor = '#157347';
        setTimeout(() => {
          btn.textContent = orig;
          btn.style.backgroundColor = '';
        }, 800);
      }

      // Przygotuj formularz do kolejnego wpisu
      $('qhProject').value = '';
      if ($('qhNote')) $('qhNote').value = '';
      $('qhProject').focus();
    }
  },

  /* ---------- Filtry tabeli Rejestru RBH ---------- */
  populateFilters() {
    const workLog = this.collectFlat();

    // 1. Lata
    const yearsSet = new Set();
    const currentYear = String(new Date().getFullYear());
    yearsSet.add(currentYear);
    workLog.forEach(w => {
      if (w.date && w.date.length >= 4) yearsSet.add(w.date.slice(0, 4));
    });
    const years = [...yearsSet].sort().reverse();
    const yearSel = $('filterMainYear');
    if (yearSel) {
      const currVal = yearSel.value || this.filterYear;
      yearSel.innerHTML = `<option value="ALL">Wszystkie lata</option>` +
        years.map(y => `<option value="${y}" ${y === currVal ? 'selected' : ''}>Rok ${y}</option>`).join('');
    }

    // 2. Pracownicy
    const empSet = new Set();
    workLog.forEach(w => { if (w.employee) empSet.add(w.employee); });
    const employees = [...empSet].sort((a, b) => a.localeCompare(b, 'pl'));
    const empSel = $('filterMainEmployee');
    if (empSel) {
      const currVal = empSel.value || this.filterEmployee;
      empSel.innerHTML = `<option value="ALL">Wszyscy pracownicy</option>` +
        employees.map(e => `<option value="${esc(e)}" ${e === currVal ? 'selected' : ''}>${esc(e)}</option>`).join('');
    }

    // 3. Projekty
    const projSet = new Set();
    workLog.forEach(w => { if (w.project) projSet.add(w.project); });
    const projects = [...projSet].sort((a, b) => a.localeCompare(b, 'pl'));
    const projSel = $('filterMainProject');
    if (projSel) {
      const currVal = projSel.value || this.filterProject;
      projSel.innerHTML = `<option value="ALL">Wszystkie projekty</option>` +
        projects.map(p => `<option value="${esc(p)}" ${p === currVal ? 'selected' : ''}>${esc(p)}</option>`).join('');
    }
  },

  refreshProjectSuggestions() {
    let dl = $('projectsDatalist');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'projectsDatalist';
      document.body.appendChild(dl);
    }
    const projects = new Set();
    Object.values(Store.data).forEach(d => {
      (d.jobs || []).forEach(j => {
        if (j.place && j.place.trim()) projects.add(j.place.trim());
      });
    });
    dl.innerHTML = [...projects].sort((a, b) => a.localeCompare(b, 'pl'))
      .map(p => `<option value="${esc(p)}">`).join('');
  },

  /* ---------- Renderowanie tabeli Rejestru Godzin RBH ---------- */
  renderTable() {
    const tbody = $('kadryTableBody');
    if (!tbody) return;

    const workLog = this.collectFlat();
    const year = $('filterMainYear')?.value || this.filterYear;
    const month = $('filterMainMonth')?.value || this.filterMonth;
    const emp = $('filterMainEmployee')?.value || this.filterEmployee;
    const proj = $('filterMainProject')?.value || this.filterProject;

    const filtered = workLog.filter(w => {
      if (!w.date) return false;
      const parts = w.date.split('-');
      if (year !== 'ALL' && parts[0] !== year) return false;
      if (month !== 'ALL' && parts[1] !== month) return false;
      if (emp !== 'ALL' && w.employee.toLowerCase() !== emp.toLowerCase()) return false;
      if (proj !== 'ALL' && w.project.toLowerCase() !== proj.toLowerCase()) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color:#64748b;">Brak wpisów dla wybranych kryteriów.</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(w => {
        const hoursDisplay = w.timeRange ? w.timeRange : '-';
        let numHours = parseFloat(w.totalHours) || 0;
        let formattedHours = Math.round(numHours * 100) / 100;

        return `<tr>
          <td>${w.date}</td>
          <td><strong>${esc(w.employee)}</strong></td>
          <td>${esc(w.project)}</td>
          <td>${esc(w.notes) || '—'}</td>
          <td style="color:#6c757d; font-size: 12px; font-weight: 500;">${hoursDisplay}</td>
          <td style="font-weight:bold; color:#0d6efd;">${formattedHours}h</td>
          <td style="white-space:nowrap;">
            <button type="button" class="biz-btn-edit" data-edit-hours="${w.date}" data-job="${w.jobIndex}" data-person="${w.personIndex}">Edytuj</button>
            <button type="button" class="biz-btn-del" data-delete-hours="${w.date}" data-job="${w.jobIndex}" data-person="${w.personIndex}">Usuń</button>
          </td>
        </tr>`;
      }).join('');
    }
  },

  /* ---------- Renderowanie kart podsumowania wg projektów ---------- */
  renderSummaryCards() {
    const people = this.collect();
    const names = this.sortedNames(people);
    const box = $('hoursList');
    if (!box) return;

    if (!names.length) {
      box.innerHTML = '<div class="empty-state">Brak wprowadzonych godzin. Dodaj godziny w formularzu powyżej. 👍</div>';
      return;
    }

    box.innerHTML = names.map(name => {
      const person = people[name];
      return `
        <section class="h-person">
          <div class="h-person-head"><span>${esc(name)}</span><span>${fmtHours(person.total)}</span></div>
          ${Object.keys(person.projects).sort((a, b) => a.localeCompare(b, 'pl')).map(pn => {
            const proj = person.projects[pn];
            return `
              <div class="h-project"><span>${esc(pn)}</span><span>${fmtHours(proj.total)}</span></div>
              ${proj.lines.map(l => {
                const time = this.timeRange(l);
                return `
                <div class="h-line">
                  <span class="h-line-desc">
                    <strong class="h-line-date">${this.lineLabel(l)}</strong>
                    ${l.note ? ' · <span class="h-note">' + esc(l.note) + '</span>' : ''}
                    ${l.real ? '' : '<span class="h-plan">plan</span>'}
                  </span>
                  <div class="h-line-right">
                    <div class="h-line-hours-box">
                      ${time ? `<span class="h-line-time ${l.real ? '' : 'plan'}" title="${l.real ? 'Rzeczywiste godziny pracy' : 'Zaplanowane godziny'}: ${time} (suma: ${fmtHours(l.hours)})">${time}</span>` : ''}
                      <span class="h-line-val">${fmtHours(l.hours)}</span>
                    </div>
                    <div class="h-line-actions">
                      <button type="button" class="btn small icon h-btn" data-edit-hours="${l.key}" data-job="${l.jobIndex}" data-person="${l.personIndex}" title="Edytuj te godziny">✏️</button>
                      <button type="button" class="btn small icon danger h-btn" data-delete-hours="${l.key}" data-job="${l.jobIndex}" data-person="${l.personIndex}" title="Usuń te godziny">🗑️</button>
                    </div>
                  </div>
                </div>`;
              }).join('')}`;
          }).join('')}
        </section>`;
    }).join('');
  },

  render() {
    this.refreshProjectSuggestions();
    this.populateFilters();
    this.renderTable();
    this.renderSummaryCards();

    const totalEl = $('hoursTotalSumBadge');
    if (totalEl) {
      totalEl.textContent = fmtHours(this.totalSum());
    }
  },

  switchView(v) {
    this.activeView = v;
    if (v === 'register') {
      $('rbhTabRegister')?.classList.add('active');
      $('rbhTabSummary')?.classList.remove('active');
      if ($('rbhRegisterView')) $('rbhRegisterView').style.display = 'block';
      if ($('rbhSummaryView')) $('rbhSummaryView').style.display = 'none';
      this.renderTable();
    } else {
      $('rbhTabSummary')?.classList.add('active');
      $('rbhTabRegister')?.classList.remove('active');
      if ($('rbhRegisterView')) $('rbhRegisterView').style.display = 'none';
      if ($('rbhSummaryView')) $('rbhSummaryView').style.display = 'block';
      this.renderSummaryCards();
    }
  },

  /* ---------- Generator bazy danych JSON dla Panelu Muraven ---------- */
  generatePanelMuravenDb(baseDb = null) {
    const workLog = [];
    const personnelSet = new Set();
    const projectsSet = new Set();
    const schedule = {};
    const yearsSet = new Set();

    const keys = Object.keys(Store.data).sort();
    let counter = 0;

    keys.forEach(date => {
      const day = Store.get(date);
      if (!day || !day.jobs) return;

      const dateYear = date.slice(0, 4);
      yearsSet.add(dateYear);

      day.jobs.forEach((job, jobIndex) => {
        if (job.status === 'moved') return;
        const project = (job.place || 'Prace ogólne').trim();
        if (project) {
          projectsSet.add(project);
          if (!schedule[date]) schedule[date] = ['', '', ''];
          const emptySlot = schedule[date].findIndex(s => !s);
          if (emptySlot !== -1 && !schedule[date].includes(project)) {
            schedule[date][emptySlot] = project;
          }
        }

        (job.people || []).forEach((p, personIndex) => {
          if (!p.name) return;
          const empName = p.name.trim();
          personnelSet.add(empName);

          const ph = personHours(p);
          const from = ph.real ? (p.realFrom || p.from) : (p.from || p.realFrom);
          const to = ph.real ? (p.realTo || p.to) : (p.to || p.realTo);
          const sT = from || '07:00';
          const eT = to || '15:30';
          const diff = ph.hours;
          const notes = (p.note || '').trim();

          counter++;
          workLog.push({
            id: p.id || `wl-${date.replace(/-/g, '')}-${jobIndex}-${personIndex}-${counter}`,
            date: date,
            employee: empName,
            project: project,
            timeRange: `${sT} - ${eT}`,
            totalHours: Math.round(diff * 100) / 100,
            notes: notes
          });
        });
      });
    });

    // Bezpieczne scalanie z istniejącym plikiem bazy Panelu Muraven (jeśli wgrany)
    if (baseDb && typeof baseDb === 'object') {
      const existingWorkLog = Array.isArray(baseDb.workLog) ? baseDb.workLog : [];
      const existingPersonnel = Array.isArray(baseDb.personnel) ? baseDb.personnel : [];
      const existingProjects = Array.isArray(baseDb.projects) ? baseDb.projects : [];
      const existingRbhYears = Array.isArray(baseDb.rbhYears) ? baseDb.rbhYears : [];

      const mergedWorkLog = [...existingWorkLog];
      workLog.forEach(newEntry => {
        const isDuplicate = existingWorkLog.some(oldEntry =>
          oldEntry.date === newEntry.date &&
          String(oldEntry.employee).trim().toLowerCase() === String(newEntry.employee).trim().toLowerCase() &&
          String(oldEntry.project).trim().toLowerCase() === String(newEntry.project).trim().toLowerCase() &&
          String(oldEntry.timeRange).replace(/\s/g, '') === String(newEntry.timeRange).replace(/\s/g, '')
        );
        if (!isDuplicate) {
          mergedWorkLog.push(newEntry);
        }
      });

      const mergedPersonnel = [...new Set([...existingPersonnel, ...personnelSet])].sort((a, b) => a.localeCompare(b, 'pl'));

      const mergedProjects = [...existingProjects];
      projectsSet.forEach(pName => {
        const exists = existingProjects.some(p => p && p.name && p.name.trim().toLowerCase() === pName.toLowerCase());
        if (!exists) {
          mergedProjects.push({
            id: "P_" + new Date().getFullYear() + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
            year: String(new Date().getFullYear()),
            name: pName,
            budget: 0,
            status: "W realizacji",
            vatRate: 0.08
          });
        }
      });

      const mergedRbhYears = [...new Set([...existingRbhYears, ...yearsSet, String(new Date().getFullYear())])].sort();

      return {
        ...baseDb,
        workLog: mergedWorkLog,
        personnel: mergedPersonnel,
        projects: mergedProjects,
        schedule: { ...(baseDb.schedule || {}), ...schedule },
        rbhYears: mergedRbhYears
      };
    }

    // Nowy pełny obiekt zgodny ze strukturą bazy danych Panelu Muraven (DEFAULT_DB)
    const currentYear = String(new Date().getFullYear());
    const rbhYears = [...new Set([...yearsSet, currentYear])].sort();
    const personnel = [...personnelSet].sort((a, b) => a.localeCompare(b, 'pl'));
    const projects = [...projectsSet].map((pName, idx) => ({
      id: "P_" + currentYear + "_" + (idx + 1),
      year: currentYear,
      name: pName,
      budget: 0,
      status: "W realizacji",
      vatRate: 0.08
    }));

    return {
      personnel,
      workLog,
      projects,
      transactions: [],
      accounts: [],
      taxes: [],
      schedule,
      priceList: [],
      materialRecipes: {},
      history: [],
      rates: {},
      kpirYears: [currentYear],
      scheduleYears: [currentYear],
      folders: [],
      scheduleColors: {},
      portfolioYears: [],
      portfolioFolders: {},
      portfolioImages: [],
      rbhYears
    };
  },

  downloadPanelMuravenJson(baseDb = null) {
    const data = this.generatePanelMuravenDb(baseDb);
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const todayStr = dateKey(new Date());
    a.download = `muraven_dane_${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Pobrano plik danych dla Panelu Muraven (${data.workLog.length} wpisów RBH)`);

    // Zapytanie o automatyczne usunięcie wyeksportowanych godzin z widoku
    if (data.workLog.length > 0) {
      setTimeout(() => {
        if (confirm(`Pobrano plik bazy z ${data.workLog.length} wpisami RBH.\n\nCzy chcesz teraz automatycznie usunąć wyeksportowane godziny z widoku planera?`)) {
          this.clearAllHours(false);
        }
      }, 400);
    }
  },

  /** Usuwa wszystkie wprowadzone godziny ze wszystkich dni. */
  clearAllHours(confirmPrompt = true) {
    if (confirmPrompt) {
      if (!confirm('Czy na pewno chcesz usunąć wszystkie wprowadzone godziny ze wszystkich dni?\n\nTej operacji nie można cofnąć bez posiadania kopii zapasowej (pliku JSON).')) {
        return false;
      }
    }

    let totalRemoved = 0;
    Object.keys(Store.data).forEach(date => {
      const day = Store.get(date);
      if (!day || !Array.isArray(day.jobs)) return;

      let changed = false;
      day.jobs.forEach(job => {
        if (Array.isArray(job.people) && job.people.length > 0) {
          totalRemoved += job.people.length;
          job.people = [];
          changed = true;
        }
      });

      if (changed) {
        day.jobs = day.jobs.filter(j => Store.jobHasContent(j));
        Store.set(date, day);
      }
    });

    App.render();
    toast(`Wyczyszczono wszystkie godziny (${totalRemoved} wpisów)`);
    return true;
  },

  handleMergeFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object') throw new Error('Nieprawidłowy format pliku');
        this.downloadPanelMuravenJson(parsed);
      } catch (err) {
        toast('Błąd scalania bazy: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  /* ---------- Edycja i usuwanie wpisów godzin ---------- */
  openEditModal(key, jobIndex, personIndex) {
    const day = Store.get(key);
    const job = day?.jobs?.[jobIndex];
    if (!job) return;
    const person = job.people?.[personIndex];
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
    const origJob = origDay?.jobs?.[jobIndex];
    if (!origJob || !origJob.people?.[personIndex]) return;

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
    const job = day?.jobs?.[jobIndex];
    if (!job || !job.people?.[personIndex]) return;
    const personName = job.people[personIndex].name;

    if (!confirm(`Czy na pewno usunąć godziny dla: ${personName}?`)) return;

    job.people.splice(personIndex, 1);
    Store.set(key, day);
    closeModal('editHoursModal');
    App.render();
    toast(`Usunięto godziny dla ${personName}`);
  },

  copyText() {
    const people = this.collect();
    const names = this.sortedNames(people);
    if (!names.length) { toast('Brak godzin do skopiowania'); return; }

    const text = names.map(name => {
      const person = people[name];
      const projects = Object.keys(person.projects).sort((a, b) => a.localeCompare(b, 'pl')).map(pn => {
        const proj = person.projects[pn];
        const lines = proj.lines.map(l => {
          const time = this.timeRange(l);
          const timeSuffix = time ? ` (${time})` : '';
          return `    ${this.lineLabel(l)}${timeSuffix}: ${fmtHours(l.hours)}${l.note ? ' · ' + l.note : ''}${l.real ? '' : ' (plan)'}`;
        }).join('\n');
        return `  ${pn} – ${fmtHours(proj.total)}\n${lines}`;
      }).join('\n');
      return `${name} – RAZEM ${fmtHours(person.total)}\n${projects}`;
    }).join('\n\n');

    navigator.clipboard.writeText(text)
      .then(() => toast('Skopiowano podsumowanie godzin'))
      .catch(() => prompt('Skopiuj tekst:', text));
  },

  init() {
    // 1. Kopiowanie tekstu
    $('copyHoursBtn')?.addEventListener('click', () => this.copyText());

    // 2. Pobieranie bazy JSON dla Panelu Muraven
    $('downloadRbhPackageBtn')?.addEventListener('click', () => this.downloadPanelMuravenJson());
    $('menuDownloadRbhBtn')?.addEventListener('click', () => this.downloadPanelMuravenJson());

    // 3. Scalanie z plikiem Panelu
    $('mergeRbhInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.handleMergeFile(file);
      e.target.value = '';
    });

    // 4. Przełącznik widoków (Tabela RBH vs Podsumowanie)
    $('rbhTabRegister')?.addEventListener('click', () => this.switchView('register'));
    $('rbhTabSummary')?.addEventListener('click', () => this.switchView('summary'));

    // 5. Zmiana filtrów tabeli
    $('filterMainYear')?.addEventListener('change', () => this.renderTable());
    $('filterMainMonth')?.addEventListener('change', () => this.renderTable());
    $('filterMainEmployee')?.addEventListener('change', () => this.renderTable());
    $('filterMainProject')?.addEventListener('change', () => this.renderTable());

    // 6. Formularz dodawania godzin
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

    // 7. Delegacja kliknięć Edytuj / Usuń w tabeli i w kartach
    const handleActionClick = (e) => {
      const editBtn = e.target.closest('[data-edit-hours]');
      if (editBtn) {
        return this.openEditModal(editBtn.dataset.editHours, Number(editBtn.dataset.job), Number(editBtn.dataset.person));
      }
      const delBtn = e.target.closest('[data-delete-hours]');
      if (delBtn) {
        return this.deleteEntry(delBtn.dataset.deleteHours, Number(delBtn.dataset.job), Number(delBtn.dataset.person));
      }
    };

    $('kadryTableBody')?.addEventListener('click', handleActionClick);
    $('hoursList')?.addEventListener('click', handleActionClick);

    // 8. Modal edycji godzin
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

    // 9. Przycisk usuwania wszystkich godzin na dole strony
    $('clearAllHoursBtn')?.addEventListener('click', () => this.clearAllHours(true));
  }
};
