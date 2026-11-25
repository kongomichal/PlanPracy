/* Plan Tygodnia + Kalendarz miesięczny na ekranie głównym:
   - Domyślny widok: Plan Tygodnia (Poniedziałek – Niedziela) z blokami projektów i zadaniami ważonymi RBH.
   - Obsługa 1 kliknięciem na telefonie: postęp zadania 0% -> 50% -> 100%, wyliczanie ile RBH/dni zostało do końca.
   - Przesuwanie prac ("⏩ Przesuń"): przełożenie pojedynczego dnia lub przesunięcie całego łańcucha projektu (+1/+2 dni robocze z efektem domina).
   - Odklikane przypomnienia zostają z zielonym ptaszkiem (✓) bez przekreślenia.
   - Odklikane (wykonane) dni znikają z kalendarza i trafiają do Archiwum (z pytaniem o przeniesienie niedokończonych zadań na jutro). */
const Calendar = {
  MONTH_NAMES: [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
  ],
  WEEKDAYS_FULL: ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'],
  WEEKDAYS_SHORT: ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'],

  viewMode: localStorage.getItem('muraven_cal_mode') || 'week', // 'week' | 'month'
  weekMonday: mondayOf(new Date()),
  year: new Date().getFullYear(),
  month: new Date().getMonth(),

  addingDateKey: null,
  editingItem: null, // { key, id }
  archiveOpen: false,
  isCollapsed: localStorage.getItem('muraven_cal_collapsed') === '1',

  // Stan modala planowania dnia (#planDayBlockModal)
  modalDateKey: null,
  modalSelectedCrew: new Set(),
  modalPreselectedTaskIds: null,

  // Stan modala przesuwania (#shiftProjectModal)
  shiftContext: null, // { fromKey, blockId, projectName }

  setViewMode(mode) {
    this.viewMode = mode === 'month' ? 'month' : 'week';
    localStorage.setItem('muraven_cal_mode', this.viewMode);
    this.addingDateKey = null;
    this.editingItem = null;
    this.render();
  },

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
      toggleText.textContent = this.isCollapsed ? 'Rozwiń' : 'Zwiń';
    }
    if (card) {
      card.classList.toggle('is-collapsed', this.isCollapsed);
    }
  },

  prevPeriod() {
    if (this.viewMode === 'week') {
      this.weekMonday = addDays(this.weekMonday, -7);
    } else {
      this.month--;
      if (this.month < 0) {
        this.month = 11;
        this.year--;
      }
    }
    this.addingDateKey = null;
    this.editingItem = null;
    this.render();
  },

  nextPeriod() {
    if (this.viewMode === 'week') {
      this.weekMonday = addDays(this.weekMonday, 7);
    } else {
      this.month++;
      if (this.month > 11) {
        this.month = 0;
        this.year++;
      }
    }
    this.addingDateKey = null;
    this.editingItem = null;
    this.render();
  },

  goToday() {
    const now = new Date();
    this.weekMonday = mondayOf(now);
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.addingDateKey = null;
    this.editingItem = null;
    this.render();
  },

  buildWeekDays() {
    const todayStr = dateKey(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const cur = addDays(this.weekMonday, i);
      const k = dateKey(cur);
      days.push({
        key: k,
        dayNum: cur.getDate(),
        monthNum: cur.getMonth(),
        yearNum: cur.getFullYear(),
        isToday: k === todayStr,
        isPast: k < todayStr,
        isWeekend: i >= 5,
        dayOfWeek: i,
        weekdayFull: this.WEEKDAYS_FULL[i],
        weekdayShort: this.WEEKDAYS_SHORT[i]
      });
    }
    return days;
  },

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
        yearNum: cur.getFullYear(),
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

  getUncompletedPastDaysInView() {
    const list = this.viewMode === 'week' ? this.buildWeekDays() : this.buildMonthDays();
    return list
      .filter(d => d.isPast && !Store.isCalendarDayDone(d.key))
      .map(d => d.key);
  },

  dismissDay(key) {
    // Sprawdź, czy w zamykanym dniu są niedokończone zadania projektowe (< 100%)
    const blocks = Store.getDayBlocks(key);
    const unfinishedToRoll = [];

    blocks.forEach(b => {
      const meta = Store.getProjectMeta(b.projectName);
      if (!meta || !Array.isArray(b.taskIds)) return;
      const pendingIds = b.taskIds.filter(tid => {
        const t = meta.tasks.find(x => x.id === tid);
        return t && (Number(t.pct ?? (t.done ? 100 : 0)) < 100);
      });
      if (pendingIds.length > 0) {
        unfinishedToRoll.push({
          projectName: b.projectName,
          taskIds: pendingIds,
          crew: b.crew || []
        });
      }
    });

    if (unfinishedToRoll.length > 0) {
      const nextWorkDay = Store.addWorkingDaysKey(key, 1, true, true);
      const nextDateObj = parseKey(nextWorkDay);
      const summaryNames = unfinishedToRoll.map(u => u.projectName).join(', ');
      const shouldCarry = confirm(
        `W tym dniu zostały nieukończone zadania (< 100%) dla: ${summaryNames}.\n\n` +
        `Czy chcesz automatycznie przerzucić ich dokończenie na kolejny dzień roboczy (${DAYS_SHORT[nextDateObj.getDay()]} ${shortDate(nextDateObj)})?`
      );
      if (shouldCarry) {
        unfinishedToRoll.forEach(u => {
          Store.addDayBlock(nextWorkDay, {
            projectName: u.projectName,
            taskIds: u.taskIds,
            crew: u.crew
          });
        });
      }
    }

    Store.setCalendarDayDone(key, true);
    if (this.addingDateKey === key) this.addingDateKey = null;
    this.render();

    const d = parseKey(key);
    toast(`Odkliknięto dzień ${DAYS_SHORT[d.getDay()]} ${shortDate(d)} (w archiwum)`, 'Cofnij', () => {
      Store.setCalendarDayDone(key, false);
      this.render();
    });
  },

  completePastDaysInView() {
    const pastKeys = this.getUncompletedPastDaysInView();
    if (!pastKeys.length) {
      return toast('Brak minionych dni do odkliknięcia w tym widoku');
    }
    pastKeys.forEach(k => Store.setCalendarDayDone(k, true));
    this.addingDateKey = null;
    this.render();
    toast(`Przeniesiono minione dni (${pastKeys.length}) do archiwum`, 'Cofnij', () => {
      pastKeys.forEach(k => Store.setCalendarDayDone(k, false));
      this.render();
    });
  },

  /* ---------- Modal Planowania Projektu i Zadań na Dzień ---------- */
  openPlanModal(dateStr, editProjectName = null) {
    this.modalDateKey = dateStr;
    const d = parseKey(dateStr);
    const wday = this.WEEKDAYS_FULL[(d.getDay() + 6) % 7];
    if ($('pdbDateKey')) $('pdbDateKey').value = dateStr;
    if ($('pdbModalTitle')) $('pdbModalTitle').textContent = `📅 Zaplanuj pracę: ${wday} ${shortDate(d)}.${d.getFullYear()}`;
    if ($('pdbReminderInput')) $('pdbReminderInput').value = '';
    if ($('pdbNewProjRow')) $('pdbNewProjRow').hidden = true;
    if ($('pdbNewProjInput')) $('pdbNewProjInput').value = '';

    const projects = Store.getProjects();
    const sel = $('pdbProjectSelect');
    if (sel) {
      if (!projects.length) {
        sel.innerHTML = `<option value="">-- Najpierw dodaj projekt przyciskiem obok --</option>`;
        if ($('pdbNewProjRow')) $('pdbNewProjRow').hidden = false;
      } else {
        sel.innerHTML = projects.map(p => {
          const st = Store.getProjectStats(p);
          const info = st.taskCount > 0 ? ` (${st.scopePct}% · zostało ~${st.remainingTaskRbh}h)` : '';
          const isSelected = editProjectName && Store.normProjKey(p) === Store.normProjKey(editProjectName);
          return `<option value="${esc(p)}" ${isSelected ? 'selected' : ''}>${esc(p)}${info}</option>`;
        }).join('');
      }
    }

    // Sprawdź czy dla wybranego projektu już istnieje blok w tym dniu
    const chosenProj = editProjectName || sel?.value || '';
    const existingBlock = Store.getDayBlocks(dateStr).find(
      b => Store.normProjKey(b.projectName) === Store.normProjKey(chosenProj)
    );

    if (existingBlock) {
      this.modalSelectedCrew = new Set(existingBlock.crew || []);
      this.modalPreselectedTaskIds = new Set(existingBlock.taskIds || []);
    } else {
      this.modalSelectedCrew = new Set();
      this.modalPreselectedTaskIds = null;
    }

    this.renderModalProjectDetails();
    this.renderModalCrew();
    openModal('planDayBlockModal');
  },

  renderModalProjectDetails() {
    const projName = $('pdbProjectSelect')?.value || '';
    const banner = $('pdbProjProgressBanner');
    const tasksBox = $('pdbTasksList');
    if (!tasksBox) return;

    if (!projName) {
      if (banner) banner.textContent = 'Wybierz lub utwórz projekt powyżej, aby przypisać jego zadania.';
      tasksBox.innerHTML = `<div class="muted small">Brak wybranego projektu.</div>`;
      return;
    }

    const meta = Store.getProjectMeta(projName);
    const st = Store.getProjectStats(projName);

    if (banner) {
      if (st.taskCount > 0) {
        banner.innerHTML = `🏗️ <b>${esc(projName)}</b> — Wykonano: <b>${st.scopePct}%</b> (${st.doneTaskRbh}/${st.totalTaskRbh} RBH) · Zostało do końca: <b>~${st.remainingTaskRbh} RBH</b> (ok. ${st.estDaysTwoPeople} dni dla 2 os.)`;
      } else if (st.poolRbh > 0) {
        banner.innerHTML = `🏗️ <b>${esc(projName)}</b> — Pula z wyceny: <b>${st.poolRbh} RBH</b>. Dopisz poniżej pomniejsze zadania, aby liczyć % postępu.`;
      } else {
        banner.innerHTML = `🏗️ <b>${esc(projName)}</b> — Dopisz poniżej pomniejsze zadania z szacowanymi godzinami RBH.`;
      }
    }

    const tasks = meta?.tasks || [];
    if (!tasks.length) {
      tasksBox.innerHTML = `<div class="muted small" style="padding:6px 4px;">Brak rozpisanych zadań w tym projekcie — możesz dodać je poniżej (np. 8h, 16h) lub zapisać sam wyjazd ekipy na budowę.</div>`;
      return;
    }

    const existingBlock = this.modalDateKey
      ? Store.getDayBlocks(this.modalDateKey).find(b => Store.normProjKey(b.projectName) === Store.normProjKey(projName))
      : null;

    tasksBox.innerHTML = tasks.map(t => {
      const pct = Number(t.pct ?? (t.done ? 100 : 0)) || 0;
      const checked = existingBlock
        ? (existingBlock.taskIds || []).includes(t.id)
        : (this.modalPreselectedTaskIds ? this.modalPreselectedTaskIds.has(t.id) : pct < 100);
      return `
        <div class="pdb-task-item">
          <label>
            <input type="checkbox" class="pdb-task-chk" value="${esc(t.id)}" ${checked ? 'checked' : ''}>
            <span>${esc(t.name)} <span class="muted small">(${t.rbh} RBH · ${pct}%)</span></span>
          </label>
          <button type="button" class="cal-proj-act-btn del" data-pdb-del-task="${esc(t.id)}" title="Usuń to zadanie z projektu">✕</button>
        </div>`;
    }).join('');
  },

  renderModalCrew() {
    const crewBox = $('pdbCrewList');
    if (!crewBox) return;
    const people = Store.getPeople();
    if (!people.length) {
      crewBox.innerHTML = `<span class="muted small">Brak zapisanych pracowników (dodasz ich w module Dodaj godziny).</span>`;
      return;
    }
    crewBox.innerHTML = people.map(name => {
      const sel = this.modalSelectedCrew.has(name);
      return `<button type="button" class="pdb-crew-pill ${sel ? 'selected' : ''}" data-pdb-crew="${esc(name)}">👷 ${esc(name)}</button>`;
    }).join('');
  },

  savePlanModal() {
    const dateStr = $('pdbDateKey')?.value || this.modalDateKey;
    if (!dateStr) return;

    const projName = ($('pdbProjectSelect')?.value || '').trim();
    const remText = ($('pdbReminderInput')?.value || '').trim();
    const checkedTaskIds = [...document.querySelectorAll('#pdbTasksList .pdb-task-chk:checked')].map(c => c.value);

    if (!projName && !remText) {
      return toast('Wybierz projekt lub wpisz przypomnienie');
    }

    if (projName) {
      // Jeśli edytujemy istniejący blok tego projektu w tym dniu, zaktualizuj dokładnie zaznaczone zadania i ekipę
      const existing = Store.getDayBlocks(dateStr).find(
        b => Store.normProjKey(b.projectName) === Store.normProjKey(projName)
      );
      if (existing) {
        existing.taskIds = checkedTaskIds;
        existing.crew = [...this.modalSelectedCrew];
        Store.saveCalendar();
      } else {
        Store.addDayBlock(dateStr, {
          projectName: projName,
          taskIds: checkedTaskIds,
          crew: [...this.modalSelectedCrew]
        });
      }
    }

    if (remText) {
      Store.addCalendarReminder(dateStr, remText);
    }

    closeModal('planDayBlockModal');
    App.render();
    toast('Zapisano plan na wybrany dzień');
  },

  /* ---------- Modal Przesuwania Projektu (Obsuwa / Efekt Domina) ---------- */
  openShiftModal(fromKey, blockId) {
    const block = Store.getDayBlocks(fromKey).find(b => b.id === blockId);
    if (!block) return;
    this.shiftContext = {
      fromKey,
      blockId,
      projectName: block.projectName
    };
    const d = parseKey(fromKey);
    const nextDayKey = Store.addWorkingDaysKey(fromKey, 1, true, true);
    if ($('shiftModalDesc')) {
      $('shiftModalDesc').textContent = `Budowa: „${block.projectName}” (z dnia ${DAYS_SHORT[d.getDay()]} ${shortDate(d)}.${d.getFullYear()})`;
    }
    if ($('shiftSingleTargetDate')) {
      $('shiftSingleTargetDate').value = nextDayKey;
    }
    openModal('shiftProjectModal');
  },

  executeChainShift(deltaDays) {
    if (!this.shiftContext) return;
    const skipSat = !!$('shiftSkipSaturday')?.checked;
    const count = Store.shiftProjectChain(
      this.shiftContext.fromKey,
      this.shiftContext.projectName,
      deltaDays,
      true,
      skipSat
    );
    closeModal('shiftProjectModal');
    this.render();
    toast(`Przesunięto harmonogram „${this.shiftContext.projectName}” o +${deltaDays} ${plural(deltaDays, 'dzień', 'dni', 'dni')} (${count} zaplanowane dni)`);
  },

  executeSingleShift() {
    if (!this.shiftContext) return;
    const targetKey = $('shiftSingleTargetDate')?.value;
    if (!targetKey) return toast('Wybierz docelową datę');
    if (targetKey === this.shiftContext.fromKey) return toast('Wybrano tę samą datę');

    const ok = Store.moveSingleDayBlock(this.shiftContext.fromKey, this.shiftContext.blockId, targetKey);
    closeModal('shiftProjectModal');
    if (ok) {
      this.render();
      const td = parseKey(targetKey);
      toast(`Przełożono dzień budowy „${this.shiftContext.projectName}” na ${DAYS_SHORT[td.getDay()]} ${shortDate(td)}`);
    }
  },

  /* ---------- Import projektów i zadań z Panelu Muraven ---------- */
  handleImportFromPanel(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const res = Store.importFromPanelMuraven(parsed);
        App.render();
        toast(`Wczytano z Panelu: ${res.importedProjects} projektów oraz ${res.importedTasks} zadań!`);
      } catch (err) {
        toast('Błąd wczytywania pliku z Panelu: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  /* ---------- Renderowanie Archiwum ---------- */
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
      boxEl.innerHTML = `<div class="cal-archive-empty">Brak odklikanych dni w archiwum. Gdy klikniesz <b>✓</b> przy wybranym dniu, dzień zniknie z widoku i trafi tutaj (a postęp projektu zostanie zachowany).</div>`;
      return;
    }

    boxEl.innerHTML = archivedKeys.map(key => {
      const d = parseKey(key);
      const reminders = Store.getCalendarDay(key);
      const blocks = Store.getDayBlocks(key);
      const dateLabel = `${longDate(d)} ${d.getFullYear()}`;

      const blocksSummary = blocks.map(b => {
        const st = Store.getProjectStats(b.projectName);
        return `<div style="font-size:12.5px; font-weight:700; color:#1e3a8a; margin-bottom:4px;">🏗️ ${esc(b.projectName)} (${st.scopePct}%) ${b.crew?.length ? '· 👷 ' + esc(b.crew.join(', ')) : ''}</div>`;
      }).join('');

      const remHtml = reminders.length
        ? `<div class="cal-arch-rem-list">
            ${reminders.map(item => `
              <div class="cal-rem-item ${item.done ? 'is-checked' : ''}">
                <button type="button" class="cal-rem-toggle" data-cal-arch-toggle="${esc(item.id)}" data-cal-date="${key}">
                  <span class="cal-rem-box" aria-hidden="true">${item.done ? '✓' : ''}</span>
                  <span class="cal-rem-text">${esc(item.text)}</span>
                </button>
              </div>
            `).join('')}
          </div>`
        : '';

      const emptyInfo = (!blocksSummary && !remHtml)
        ? `<div class="cal-arch-no-rem">Brak wpisanych zadań i przypomnień w tym dniu</div>`
        : '';

      return `
        <div class="cal-arch-card" data-arch-day="${key}">
          <div class="cal-arch-head">
            <div class="cal-arch-date">
              <span class="cal-done-badge">✓ Wykonany dzień</span>
              <strong>${esc(dateLabel)}</strong>
            </div>
            <div class="cal-arch-btns">
              <button type="button" class="btn small" data-cal-restore-day="${key}">↩ Przywróć</button>
              <button type="button" class="btn small danger" data-cal-purge-day="${key}">🗑️</button>
            </div>
          </div>
          ${blocksSummary}
          ${remHtml}
          ${emptyInfo}
        </div>`;
    }).join('');
  },

  /* ---------- Renderowanie Bloku Projektu w Kafelku Dnia ---------- */
  renderDayBlocksHtml(dateStr, compactMonth = false) {
    const blocks = Store.getDayBlocks(dateStr);
    if (!blocks.length) return '';

    if (compactMonth) {
      return blocks.map(b => {
        const st = Store.getProjectStats(b.projectName);
        const pctTxt = st.taskCount > 0 ? ` · ${st.scopePct}%` : '';
        return `
          <div class="cal-month-proj-badge" data-cal-edit-block="${esc(b.id)}" data-cal-date="${dateStr}" data-cal-proj="${esc(b.projectName)}" title="Kliknij, aby edytować zadania projektu w tym dniu">
            <span>🏗️ ${esc(b.projectName)}${pctTxt}</span>
          </div>`;
      }).join('');
    }

    return `<div class="cal-proj-blocks">` + blocks.map(b => {
      const meta = Store.getProjectMeta(b.projectName);
      const st = Store.getProjectStats(b.projectName);
      const pillText = st.taskCount > 0
        ? `${st.scopePct}% · zostało ~${st.remainingTaskRbh}h${st.estDaysTwoPeople > 0 ? ` (~${st.estDaysTwoPeople}d)` : ''}`
        : (st.poolRbh > 0 ? `Pula: ${st.poolRbh}h` : 'W realizacji');

      const tasksRows = (b.taskIds || []).map(tid => {
        const t = (meta?.tasks || []).find(x => x.id === tid);
        if (!t) return '';
        const pct = Number(t.pct ?? (t.done ? 100 : 0)) || 0;
        const stCls = pct === 100 ? 'st-done' : (pct > 0 ? 'st-half' : '');
        const stLabel = pct === 100 ? '✓ 100%' : (pct > 0 ? `◐ ${pct}%` : '0% · Start');
        return `
          <div class="cal-proj-task ${stCls}" data-cal-cycle-task="${esc(t.id)}" data-cal-proj="${esc(b.projectName)}" title="Kliknij, aby zmienić postęp zadania (0% → 50% → 100%)">
            <div>
              <span class="cal-proj-task-name">${esc(t.name)}</span>
              <span class="cal-proj-task-rbh">(${t.rbh}h)</span>
            </div>
            <span class="cal-task-status-pill">${stLabel}</span>
          </div>`;
      }).filter(Boolean).join('');

      const crewHtml = (b.crew && b.crew.length)
        ? `<div class="cal-proj-crew">👷 ${b.crew.map(c => `<span class="cal-crew-chip">${esc(c)}</span>`).join('')}</div>`
        : '';

      return `
        <div class="cal-proj-block" data-block-id="${esc(b.id)}">
          <div class="cal-proj-top">
            <div class="cal-proj-title-group">
              <span class="cal-proj-name">🏗️ ${esc(b.projectName)}</span>
              <span class="cal-proj-prog-pill ${st.scopePct === 100 && st.taskCount > 0 ? 'done' : ''}">${pillText}</span>
            </div>
            <div class="cal-proj-actions">
              <button type="button" class="cal-proj-act-btn shift" data-cal-shift-block="${esc(b.id)}" data-cal-date="${dateStr}" title="Obsuwa na budowie? Przesuń ten lub wszystkie kolejne dni tego projektu">⏩ Przesuń</button>
              <button type="button" class="cal-proj-act-btn" data-cal-edit-block="${esc(b.id)}" data-cal-date="${dateStr}" data-cal-proj="${esc(b.projectName)}" title="Edytuj zadania i ekipę w tym dniu">✎</button>
              <button type="button" class="cal-proj-act-btn del" data-cal-del-block="${esc(b.id)}" data-cal-date="${dateStr}" title="Usuń ten projekt z tego dnia">✕</button>
            </div>
          </div>
          ${crewHtml}
          ${tasksRows ? `<div class="cal-proj-tasks">${tasksRows}</div>` : ''}
        </div>`;
    }).join('') + `</div>`;
  },

  renderRemindersHtml(dateStr) {
    const reminders = Store.getCalendarDay(dateStr);
    return reminders.map(item => {
      const isEditing = this.editingItem && this.editingItem.key === dateStr && this.editingItem.id === item.id;
      if (isEditing) {
        return `
          <div class="cal-rem-edit-box" data-cal-edit-row="${esc(item.id)}" data-cal-date="${dateStr}">
            <input type="text" class="cal-rem-edit-input" value="${esc(item.text)}" data-cal-edit-input="${esc(item.id)}" data-cal-date="${dateStr}" autocomplete="off">
            <div class="cal-add-actions">
              <button type="button" class="cal-mini-btn save" data-cal-save-edit="${esc(item.id)}" data-cal-date="${dateStr}">✓ Zapisz</button>
              <button type="button" class="cal-mini-btn cancel" data-cal-cancel-edit>✕</button>
            </div>
          </div>`;
      }

      return `
        <div class="cal-rem-item ${item.done ? 'is-checked' : ''}" data-cal-item="${esc(item.id)}" data-cal-date="${dateStr}">
          <button type="button" class="cal-rem-toggle" data-cal-toggle="${esc(item.id)}" data-cal-date="${dateStr}" title="${item.done ? 'Cofnij odklikanie przypomnienia' : 'Odkliknij przypomnienie (pojawi się ptaszek)'}">
            <span class="cal-rem-box" aria-hidden="true">${item.done ? '✓' : ''}</span>
            <span class="cal-rem-text">${esc(item.text)}</span>
          </button>
          <div class="cal-rem-actions">
            <button type="button" class="cal-rem-act edit" data-cal-start-edit="${esc(item.id)}" data-cal-date="${dateStr}" title="Edytuj treść">✏️</button>
            <button type="button" class="cal-rem-act del" data-cal-del="${esc(item.id)}" data-cal-date="${dateStr}" title="Usuń przypomnienie">✕</button>
          </div>
        </div>`;
    }).join('');
  },

  render() {
    // Przełączniki trybu
    document.querySelectorAll('[data-cal-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.calMode === this.viewMode);
    });

    const titleEl = $('calMonthTitle');
    if (titleEl) {
      if (this.viewMode === 'week') {
        const sun = addDays(this.weekMonday, 6);
        titleEl.textContent = `${shortDate(this.weekMonday)} – ${shortDate(sun)}.${sun.getFullYear()}`;
      } else {
        titleEl.textContent = `${this.MONTH_NAMES[this.month]} ${this.year}`;
      }
    }

    const pastUncompleted = this.getUncompletedPastDaysInView();
    const pastBtn = $('calCompletePastBtn');
    const pastCountEl = $('calPastDaysCount');
    if (pastCountEl) pastCountEl.textContent = pastUncompleted.length;
    if (pastBtn) pastBtn.hidden = pastUncompleted.length === 0;

    const gridEl = $('calGrid');
    if (!gridEl) return;

    const weekdaysBar = document.querySelector('.cal-weekdays');
    if (weekdaysBar) weekdaysBar.style.display = 'none';

    gridEl.classList.toggle('week-mode', this.viewMode === 'week');

    const allDays = this.viewMode === 'week' ? this.buildWeekDays() : this.buildMonthDays();
    const activeDays = allDays.filter(d => !Store.isCalendarDayDone(d.key));

    if (activeDays.length === 0) {
      gridEl.innerHTML = `
        <div class="cal-empty-month" style="grid-column: 1 / -1;">
          Wszystkie dni z tego widoku zostały odklikane i przeniesione do <b>Archiwum wykonanych dni</b> poniżej.
        </div>`;
      this.renderArchive();
      this.renderCollapseState();
      return;
    }

    const isWeek = this.viewMode === 'week';

    gridEl.innerHTML = activeDays.map(d => {
      const isAdding = this.addingDateKey === d.key;
      const blocksHtml = this.renderDayBlocksHtml(d.key, !isWeek);
      const itemsHtml = this.renderRemindersHtml(d.key);

      const addBoxHtml = isAdding ? `
        <form class="cal-add-form" data-cal-form="${d.key}">
          <input type="text" class="cal-add-input" data-cal-input="${d.key}" placeholder="Wpisz przypomnienie..." autocomplete="off">
          <div class="cal-add-actions">
            <button type="submit" class="cal-mini-btn save">✓ Dodaj</button>
            <button type="button" class="cal-mini-btn cancel" data-cal-close-add>✕</button>
          </div>
        </form>
      ` : '';

      const emptyWeekHint = (isWeek && !blocksHtml && !itemsHtml && !isAdding)
        ? `<div class="cal-empty-day-hint">Brak zaplanowanych prac — kliknij „+ Zaplanuj”</div>`
        : '';

      return `
        <div class="cal-day ${d.isToday ? 'today' : ''} ${d.isWeekend ? 'weekend' : ''}" data-cal-day="${d.key}">
          <div class="cal-day-head">
            <span class="cal-day-num">
              <span class="cal-day-wday-badge ${d.isWeekend ? 'weekend' : ''}">${isWeek ? d.weekdayFull : d.weekdayShort}</span>
              <strong>${d.dayNum}.${String(d.monthNum + 1).padStart(2, '0')}</strong>
              ${d.isToday ? '<span class="cal-today-pill">Dziś</span>' : ''}
            </span>
            <div class="cal-day-head-btns">
              <button type="button" class="cal-plan-day-btn" data-cal-plan-day="${d.key}" title="Zaplanuj budowę i zadania na ten dzień">+ Zaplanuj</button>
              <button type="button" class="cal-day-add-btn" data-cal-open-add="${d.key}" title="Dodaj luźne przypomnienie">＋</button>
              <button type="button" class="cal-day-done-btn" data-cal-done-day="${d.key}" title="Odkliknij wykonany dzień (trafi do archiwum)">✓</button>
            </div>
          </div>
          ${blocksHtml}
          <div class="cal-rem-list">${itemsHtml}</div>
          ${emptyWeekHint}
          ${addBoxHtml}
        </div>`;
    }).join('');

    if (this.addingDateKey) {
      const inp = gridEl.querySelector(`.cal-add-input[data-cal-input="${this.addingDateKey}"]`);
      if (inp) setTimeout(() => inp.focus(), 10);
    } else if (this.editingItem) {
      const inp = gridEl.querySelector(`.cal-rem-edit-input[data-cal-edit-input="${this.editingItem.id}"]`);
      if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 10);
    }

    this.renderArchive();
    this.renderCollapseState();
  },

  init() {
    $('calModeSwitch')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cal-mode]');
      if (btn) this.setViewMode(btn.dataset.calMode);
    });

    $('calPrevMonthBtn')?.addEventListener('click', () => this.prevPeriod());
    $('calNextMonthBtn')?.addEventListener('click', () => this.nextPeriod());
    $('calTodayBtn')?.addEventListener('click', () => this.goToday());
    $('calCompletePastBtn')?.addEventListener('click', () => this.completePastDaysInView());
    $('calToggleBtn')?.addEventListener('click', () => this.toggleCollapse());
    $('calTitleWrap')?.addEventListener('click', () => this.toggleCollapse());

    // Przyciski synchronizacji JSON z Panelem Muraven na pasku kalendarza
    $('calImportPanelInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.handleImportFromPanel(file);
      e.target.value = '';
    });
    $('calExportPanelBtn')?.addEventListener('click', () => {
      if (typeof Hours !== 'undefined' && Hours.downloadPanelMuravenJson) {
        Hours.downloadPanelMuravenJson();
      }
    });

    // Obsługa modala #planDayBlockModal
    $('pdbProjectSelect')?.addEventListener('change', () => {
      const projName = $('pdbProjectSelect').value;
      const existingBlock = this.modalDateKey
        ? Store.getDayBlocks(this.modalDateKey).find(b => Store.normProjKey(b.projectName) === Store.normProjKey(projName))
        : null;
      if (existingBlock) {
        this.modalSelectedCrew = new Set(existingBlock.crew || []);
      }
      this.modalPreselectedTaskIds = null;
      this.renderModalProjectDetails();
      this.renderModalCrew();
    });

    $('pdbToggleNewProjBtn')?.addEventListener('click', () => {
      const row = $('pdbNewProjRow');
      if (!row) return;
      row.hidden = !row.hidden;
      if (!row.hidden) $('pdbNewProjInput')?.focus();
    });

    $('pdbSaveNewProjBtn')?.addEventListener('click', () => {
      const name = ($('pdbNewProjInput')?.value || '').trim();
      if (!name) return toast('Wpisz nazwę nowego projektu');
      Store.ensureProject(name);
      if ($('pdbNewProjInput')) $('pdbNewProjInput').value = '';
      if ($('pdbNewProjRow')) $('pdbNewProjRow').hidden = true;
      this.openPlanModal(this.modalDateKey, name);
      toast(`Dodano projekt „${name}”`);
    });

    document.querySelectorAll('[data-rbh-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        if ($('pdbNewTaskRbh')) $('pdbNewTaskRbh').value = btn.dataset.rbhPreset;
      });
    });

    $('pdbAddTaskBtn')?.addEventListener('click', () => {
      const projName = ($('pdbProjectSelect')?.value || '').trim();
      if (!projName) return toast('Najpierw wybierz lub dodaj projekt powyżej');
      const tName = ($('pdbNewTaskName')?.value || '').trim();
      const tRbh = $('pdbNewTaskRbh')?.value || 8;
      if (!tName) return toast('Wpisz nazwę zadania');

      // Zachowaj aktualnie zaznaczone checkboxy + zaznacz nowo dodane zadanie
      const curChecked = new Set([...document.querySelectorAll('#pdbTasksList .pdb-task-chk:checked')].map(c => c.value));
      const added = Store.addProjectTask(projName, tName, tRbh);
      if (added) {
        curChecked.add(added.id);
        this.modalPreselectedTaskIds = curChecked;
      }
      if ($('pdbNewTaskName')) $('pdbNewTaskName').value = '';
      this.renderModalProjectDetails();
      this.render();
      toast(`Dodano zadanie „${tName}” (${added.rbh} RBH)`);
    });

    $('pdbNewTaskName')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('pdbAddTaskBtn')?.click();
      }
    });

    $('pdbTasksList')?.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-pdb-del-task]');
      if (delBtn) {
        const projName = ($('pdbProjectSelect')?.value || '').trim();
        if (!projName) return;
        Store.deleteProjectTask(projName, delBtn.dataset.pdbDelTask);
        this.renderModalProjectDetails();
        this.render();
      }
    });

    $('pdbCrewList')?.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-pdb-crew]');
      if (!pill) return;
      const name = pill.dataset.pdbCrew;
      if (this.modalSelectedCrew.has(name)) this.modalSelectedCrew.delete(name);
      else this.modalSelectedCrew.add(name);
      this.renderModalCrew();
    });

    $('pdbConfirmSaveBtn')?.addEventListener('click', () => this.savePlanModal());

    // Obsługa modala #shiftProjectModal
    $('shiftChainPlus1Btn')?.addEventListener('click', () => this.executeChainShift(1));
    $('shiftChainPlus2Btn')?.addEventListener('click', () => this.executeChainShift(2));
    $('shiftSingleConfirmBtn')?.addEventListener('click', () => this.executeSingleShift());

    // Archiwum
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
        if (!confirm(`Usunąć trwale z archiwum dzień ${shortDate(d)}.${d.getFullYear()} wraz z jego zawartością?`)) return;
        Store.setCalendarDayDone(key, false);
        if (Store.calendarNotes) {
          if (Store.calendarNotes.byDate) delete Store.calendarNotes.byDate[key];
          if (Store.calendarNotes.dayBlocks) delete Store.calendarNotes.dayBlocks[key];
          Store.saveCalendar();
        }
        this.render();
        toast('Usunięto dzień z archiwum');
      }
    });

    // Kliknięcia na siatce kalendarza / planu tygodnia
    const gridEl = $('calGrid');
    if (!gridEl) return;

    gridEl.addEventListener('click', (e) => {
      const planBtn = e.target.closest('[data-cal-plan-day]');
      if (planBtn) {
        e.stopPropagation();
        this.openPlanModal(planBtn.dataset.calPlanDay);
        return;
      }

      const cycleTaskEl = e.target.closest('[data-cal-cycle-task]');
      if (cycleTaskEl) {
        e.stopPropagation();
        const projName = cycleTaskEl.dataset.calProj;
        const taskId = cycleTaskEl.dataset.calCycleTask;
        const updated = Store.cycleProjectTaskPct(projName, taskId);
        this.render();
        if (updated) {
          const st = Store.getProjectStats(projName);
          toast(`${projName}: „${updated.name}” → ${updated.pct}% (Cały projekt: ${st.scopePct}%, zostało ~${st.remainingTaskRbh}h)`);
        }
        return;
      }

      const shiftBtn = e.target.closest('[data-cal-shift-block]');
      if (shiftBtn) {
        e.stopPropagation();
        this.openShiftModal(shiftBtn.dataset.calDate, shiftBtn.dataset.calShiftBlock);
        return;
      }

      const editBlockBtn = e.target.closest('[data-cal-edit-block]');
      if (editBlockBtn) {
        e.stopPropagation();
        this.openPlanModal(editBlockBtn.dataset.calDate, editBlockBtn.dataset.calProj);
        return;
      }

      const delBlockBtn = e.target.closest('[data-cal-del-block]');
      if (delBlockBtn) {
        e.stopPropagation();
        Store.deleteDayBlock(delBlockBtn.dataset.calDate, delBlockBtn.dataset.calDelBlock);
        this.render();
        toast('Usunięto projekt z wybranego dnia');
        return;
      }

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
        Store.toggleCalendarReminder(toggleBtn.dataset.calDate, toggleBtn.dataset.calToggle);
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
        Store.deleteCalendarReminder(delBtn.dataset.calDate, delBtn.dataset.calDel);
        this.render();
        return;
      }

      // Kliknięcie w pustą przestrzeń dnia w widoku miesiąca otwiera dodawanie przypomnienia
      const dayCell = e.target.closest('[data-cal-day]');
      if (
        dayCell &&
        this.viewMode === 'month' &&
        !e.target.closest('.cal-add-form') &&
        !e.target.closest('.cal-rem-edit-box') &&
        !e.target.closest('.cal-rem-item') &&
        !e.target.closest('.cal-proj-block') &&
        !e.target.closest('.cal-month-proj-badge')
      ) {
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
