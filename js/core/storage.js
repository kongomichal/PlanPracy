/* Zapis i odczyt danych. Dziś: localStorage. Później łatwo podmienić na serwer.
   Dzień = { date, jobs: [ praca, praca, ... ] }
   Praca = { place, goal, status, people:[{name,from,to}], items:[{type,text,done}], result } */
const Store = {
  KEY: 'muraven_plan_v2',
  data: {},

  unsub: null,

  REMINDERS_KEY: 'muraven_reminders_v1',
  reminders: null,

  PROJECTS_KEY: 'muraven_projects_v1',
  projectsMeta: null,

  CALENDAR_KEY: 'muraven_calendar_v1',
  calendarNotes: null,

  col() { return firebase.firestore().collection('days'); },

  load() {
    this.loadReminders();
    this.loadProjects();
    this.loadCalendar();
    if (CLOUD_ENABLED) { this.data = {}; return; } // dane przyjdą z chmury po zalogowaniu
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { this.data = this.normalize(JSON.parse(raw)); this.save(); return; }
    } catch (e) { console.error('Błąd odczytu danych', e); }
    this.data = buildSampleData(mondayOf());
    this.save();
  },

  save() {
    if (CLOUD_ENABLED) return;
    localStorage.setItem(this.KEY, JSON.stringify(this.data));
  },

  /** Nasłuchuje zmian w chmurze i woła onChange przy każdej aktualizacji. */
  startSync(onChange) {
    if (!CLOUD_ENABLED || this.unsub) return;
    this.unsub = this.col().onSnapshot((snap) => {
      const raw = {};
      let cloudReminders = null;
      let cloudProjects = null;
      let cloudCalendar = null;

      snap.forEach(doc => {
        if (doc.id === '_reminders') {
          cloudReminders = doc.data();
        } else if (doc.id === '_projects') {
          cloudProjects = doc.data();
        } else if (doc.id === '_calendar') {
          cloudCalendar = doc.data();
        } else if (!doc.id.startsWith('_')) {
          raw[doc.id] = doc.data();
        }
      });

      this.data = this.normalize(raw);

      if (cloudReminders && Array.isArray(cloudReminders.sections)) {
        this.reminders = {
          sections: cloudReminders.sections,
          items: Array.isArray(cloudReminders.items) ? cloudReminders.items : []
        };
        localStorage.setItem(this.REMINDERS_KEY, JSON.stringify(this.reminders));
      } else if (!cloudReminders && this.reminders && firebase.auth && firebase.auth().currentUser) {
        // Jeśli baza w chmurze nie ma jeszcze _reminders, wyślij obecne lokalne
        this.saveReminders();
      }

      if (cloudProjects && (Array.isArray(cloudProjects.custom) || Array.isArray(cloudProjects.deleted))) {
        this.projectsMeta = {
          custom: Array.isArray(cloudProjects.custom) ? cloudProjects.custom : [],
          deleted: Array.isArray(cloudProjects.deleted) ? cloudProjects.deleted : []
        };
        localStorage.setItem(this.PROJECTS_KEY, JSON.stringify(this.projectsMeta));
      } else if (!cloudProjects && this.projectsMeta && firebase.auth && firebase.auth().currentUser) {
        this.saveProjects();
      }

      if (cloudCalendar && cloudCalendar.byDate && typeof cloudCalendar.byDate === 'object') {
        this.calendarNotes = { byDate: cloudCalendar.byDate };
        localStorage.setItem(this.CALENDAR_KEY, JSON.stringify(this.calendarNotes));
      } else if (!cloudCalendar && this.calendarNotes && firebase.auth && firebase.auth().currentUser) {
        this.saveCalendar();
      }

      onChange();
    }, (err) => { console.error(err); toast('Brak połączenia z bazą danych'); });
  },

  stopSync() {
    if (this.unsub) this.unsub();
    this.unsub = null;
    if (CLOUD_ENABLED) {
      this.data = {};
      this.reminders = null;
      this.projectsMeta = null;
      this.calendarNotes = null;
    }
  },

  /** Zastępuje wszystkie dane w chmurze podanymi (nie naruszając przypomnień i listy projektów). */
  replaceAll(newData) {
    this.data = newData;
    if (!CLOUD_ENABLED) return this.save();
    const batch = firebase.firestore().batch();
    Object.keys(newData).forEach(k => {
      if (!k.startsWith('_')) batch.set(this.col().doc(k), newData[k]);
    });
    this.col().get().then(snap => {
      snap.forEach(doc => {
        if (!doc.id.startsWith('_') && !newData[doc.id]) {
          batch.delete(doc.ref);
        }
      });
      return batch.commit();
    }).catch(() => toast('Nie udało się zapisać w chmurze'));
  },

  /** Przekształca tekst celu na strukturę zadań i podzadań dla starych wpisów. */
  parseGoalToTasks(goal) {
    if (!goal || typeof goal !== 'string') return [];
    const trimmed = goal.trim();
    if (!trimmed) return [];

    // np. "Płytka: - bok lewa strona - środek góra - piony dół - przeniesienie rusztowania drugi bok"
    if (trimmed.includes(':') && (trimmed.includes(' - ') || trimmed.includes('\n-') || trimmed.includes('\n•') || trimmed.includes(' • '))) {
      const colonIdx = trimmed.indexOf(':');
      const title = trimmed.slice(0, colonIdx).trim();
      const rest = trimmed.slice(colonIdx + 1);
      const subtasks = rest.split(/(?:\r?\n|\s+)(?:-|•)\s+/)
        .map(s => s.trim().replace(/^[-•]\s*/, ''))
        .filter(Boolean);
      return [{ title, subtasks }];
    }

    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.slice(1).some(l => l.startsWith('-') || l.startsWith('•'))) {
      const title = lines[0].replace(/:$/, '').trim();
      const subtasks = lines.slice(1).map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
      return [{ title, subtasks }];
    }

    return [{ title: trimmed, subtasks: [] }];
  },

  /** Normalizuje pojedynczą pracę (zapewnia istnienie tasks[] i spójność goal). */
  normalizeJob(j) {
    let tasks = Array.isArray(j.tasks) ? j.tasks : [];
    if (!tasks.length && j.goal) {
      tasks = this.parseGoalToTasks(j.goal);
    }
    tasks = tasks.map(t => ({
      title: typeof t === 'string' ? t : (t.title || ''),
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(s => String(s).trim()).filter(Boolean) : []
    })).filter(t => t.title || t.subtasks.length);

    const goal = j.goal || tasks.map(t => t.title + (t.subtasks.length ? ': ' + t.subtasks.join(', ') : '')).join('; ');

    return {
      place: j.place || '',
      goal,
      tasks,
      status: j.status || 'plan',
      people: j.people || [],
      items: j.items || [],
      result: j.result || ''
    };
  },

  /** Zamienia stary format (1 praca w dniu) na nowy (lista prac ze strukturą zadań). */
  normalize(data) {
    const out = {};
    Object.entries(data || {}).forEach(([key, day]) => {
      let jobs = [];
      if (Array.isArray(day.jobs)) {
        jobs = day.jobs.map(j => this.normalizeJob(j));
      } else {
        const j = this.normalizeJob(day);
        if (this.jobHasContent(j)) jobs.push(j);
      }
      out[key] = { date: key, jobs, dismissed: !!day.dismissed };
    });
    return out;
  },

  emptyJob() {
    return { place: '', goal: '', tasks: [{ title: '', subtasks: [] }], status: 'plan', people: [], items: [], result: '' };
  },

  jobHasContent(j) {
    const hasTasks = Array.isArray(j.tasks) && j.tasks.some(t => t.title || (t.subtasks && t.subtasks.length));
    return !!(j.place || hasTasks || j.goal || j.people.length || j.items.length);
  },

  empty(key) {
    return { date: key, jobs: [], dismissed: false };
  },

  get(key) {
    const day = this.data[key] || this.empty(key);
    if (!Array.isArray(day.jobs)) day.jobs = [];
    if (day.dismissed === undefined) day.dismissed = false;
    return day;
  },

  isDismissed(key) {
    return !!(this.data[key] && this.data[key].dismissed);
  },

  setDismissed(key, dismissed) {
    const day = this.get(key);
    day.dismissed = !!dismissed;
    this.set(key, day);
  },

  set(key, day) {
    this.data[key] = day;
    this.save();
    if (CLOUD_ENABLED) {
      this.col().doc(key).set(JSON.parse(JSON.stringify(day)))
        .catch(() => toast('Nie udało się zapisać w chmurze'));
    }
  },

  defaultReminders() {
    return {
      sections: [
        { id: 'sec-general', name: 'Ogólne', color: '#2563eb' },
        { id: 'sec-sites', name: 'Budowy', color: '#ea580c' },
        { id: 'sec-materials', name: 'Materiały i zakupy', color: '#16a34a' }
      ],
      items: [
        { id: 'rem-1', sectionId: 'sec-sites', text: 'Sprawdzić rusztowanie na budowie Tefra', done: false, parentId: null, createdAt: Date.now() },
        { id: 'rem-2', sectionId: 'sec-sites', text: 'Zrobić odbiór techniczny poziomów', done: false, parentId: 'rem-1', createdAt: Date.now() },
        { id: 'rem-3', sectionId: 'sec-materials', text: 'Zamówić fugi i taśmy zbrojące', done: false, parentId: null, createdAt: Date.now() }
      ]
    };
  },

  loadReminders() {
    try {
      const raw = localStorage.getItem(this.REMINDERS_KEY);
      if (raw) {
        this.reminders = JSON.parse(raw);
        if (!Array.isArray(this.reminders.sections)) this.reminders.sections = [];
        if (!Array.isArray(this.reminders.items)) this.reminders.items = [];
        return this.reminders;
      }
    } catch (e) { console.error('Błąd odczytu przypomnień', e); }
    this.reminders = this.defaultReminders();
    if (!CLOUD_ENABLED) {
      this.saveReminders();
    }
    return this.reminders;
  },

  saveReminders() {
    if (!this.reminders) return;
    localStorage.setItem(this.REMINDERS_KEY, JSON.stringify(this.reminders));
    if (CLOUD_ENABLED && firebase.firestore && firebase.auth && firebase.auth().currentUser) {
      this.col().doc('_reminders').set(JSON.parse(JSON.stringify(this.reminders)))
        .catch((err) => console.error('Błąd zapisu przypomnień w chmurze', err));
    }
  },

  loadProjects() {
    try {
      const raw = localStorage.getItem(this.PROJECTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.projectsMeta = {
          custom: Array.isArray(parsed?.custom) ? parsed.custom : [],
          deleted: Array.isArray(parsed?.deleted) ? parsed.deleted : []
        };
        return this.projectsMeta;
      }
    } catch (e) { console.error('Błąd odczytu projektów', e); }
    this.projectsMeta = { custom: [], deleted: [] };
    if (!CLOUD_ENABLED) {
      this.saveProjects();
    }
    return this.projectsMeta;
  },

  saveProjects() {
    if (!this.projectsMeta) return;
    localStorage.setItem(this.PROJECTS_KEY, JSON.stringify(this.projectsMeta));
    if (CLOUD_ENABLED && firebase.firestore && firebase.auth && firebase.auth().currentUser) {
      this.col().doc('_projects').set(JSON.parse(JSON.stringify(this.projectsMeta)))
        .catch((err) => console.error('Błąd zapisu projektów w chmurze', err));
    }
  },

  /** Zwraca posortowaną listę aktywnych projektów (z historii + dodane ręcznie, z pominięciem usuniętych). */
  getProjects() {
    if (!this.projectsMeta) this.loadProjects();
    const deletedLower = new Set(
      (this.projectsMeta.deleted || []).map(p => String(p).trim().toLowerCase()).filter(Boolean)
    );
    const map = new Map(); // lower -> original

    (this.projectsMeta.custom || []).forEach(p => {
      const trimmed = String(p || '').trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!deletedLower.has(lower)) {
        map.set(lower, trimmed);
      }
    });

    Object.values(this.data || {}).forEach(d => {
      (d.jobs || []).forEach(j => {
        const trimmed = (j.place || '').trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();
        if (!deletedLower.has(lower) && !map.has(lower)) {
          map.set(lower, trimmed);
        }
      });
    });

    return [...map.values()].sort((a, b) => a.localeCompare(b, 'pl'));
  },

  /** Dodaje projekt do listy (i przywraca, jeśli był wcześniej usunięty). */
  ensureProject(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    if (!this.projectsMeta) this.loadProjects();
    const lower = trimmed.toLowerCase();

    let changed = false;
    const prevDelLen = this.projectsMeta.deleted.length;
    this.projectsMeta.deleted = this.projectsMeta.deleted.filter(
      p => String(p).trim().toLowerCase() !== lower
    );
    if (this.projectsMeta.deleted.length !== prevDelLen) changed = true;

    const existingIdx = this.projectsMeta.custom.findIndex(
      p => String(p).trim().toLowerCase() === lower
    );
    if (existingIdx === -1) {
      this.projectsMeta.custom.push(trimmed);
      changed = true;
    } else if (this.projectsMeta.custom[existingIdx] !== trimmed) {
      this.projectsMeta.custom[existingIdx] = trimmed;
      changed = true;
    }

    if (changed) this.saveProjects();
    return true;
  },

  /** Usuwa projekt z listy podpowiedzi (ukrywa go także jeśli występował w starszych wpisach). */
  deleteProject(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    if (!this.projectsMeta) this.loadProjects();
    const lower = trimmed.toLowerCase();

    this.projectsMeta.custom = this.projectsMeta.custom.filter(
      p => String(p).trim().toLowerCase() !== lower
    );
    const alreadyDeleted = this.projectsMeta.deleted.some(
      p => String(p).trim().toLowerCase() === lower
    );
    if (!alreadyDeleted) {
      this.projectsMeta.deleted.push(trimmed);
    }
    this.saveProjects();
    return true;
  },

  /** Zmienia nazwę projektu na liście oraz aktualizuje istniejące wpisy z tą nazwą budowy. */
  renameProject(oldName, newName) {
    const oldTrim = String(oldName || '').trim();
    const newTrim = String(newName || '').trim();
    if (!oldTrim || !newTrim) return false;
    if (!this.projectsMeta) this.loadProjects();

    const oldLower = oldTrim.toLowerCase();
    const newLower = newTrim.toLowerCase();

    this.projectsMeta.custom = this.projectsMeta.custom.filter(
      p => String(p).trim().toLowerCase() !== oldLower && String(p).trim().toLowerCase() !== newLower
    );
    this.projectsMeta.custom.push(newTrim);

    this.projectsMeta.deleted = this.projectsMeta.deleted.filter(
      p => String(p).trim().toLowerCase() !== newLower
    );
    if (oldLower !== newLower) {
      const alreadyDel = this.projectsMeta.deleted.some(p => String(p).trim().toLowerCase() === oldLower);
      if (!alreadyDel) this.projectsMeta.deleted.push(oldTrim);
    }

    // Zaktualizuj również istniejące dni, które miały przypisany stary projekt
    Object.keys(this.data || {}).forEach(date => {
      const day = this.get(date);
      if (!day || !Array.isArray(day.jobs)) return;
      let dayChanged = false;
      day.jobs.forEach(job => {
        if ((job.place || '').trim().toLowerCase() === oldLower) {
          job.place = newTrim;
          dayChanged = true;
        }
      });
      if (dayChanged) {
        this.set(date, day);
      }
    });

    this.saveProjects();
    return true;
  },

  /* ---------- Przypomnienia kalendarza miesięcznego ---------- */
  loadCalendar() {
    try {
      const raw = localStorage.getItem(this.CALENDAR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.calendarNotes = {
          byDate: (parsed && typeof parsed.byDate === 'object' && parsed.byDate) ? parsed.byDate : {}
        };
        return this.calendarNotes;
      }
    } catch (e) { console.error('Błąd odczytu kalendarza', e); }
    this.calendarNotes = { byDate: {} };
    if (!CLOUD_ENABLED) {
      this.saveCalendar();
    }
    return this.calendarNotes;
  },

  saveCalendar() {
    if (!this.calendarNotes) return;
    localStorage.setItem(this.CALENDAR_KEY, JSON.stringify(this.calendarNotes));
    if (CLOUD_ENABLED && firebase.firestore && firebase.auth && firebase.auth().currentUser) {
      this.col().doc('_calendar').set(JSON.parse(JSON.stringify(this.calendarNotes)))
        .catch((err) => console.error('Błąd zapisu kalendarza w chmurze', err));
    }
  },

  getCalendarDay(key) {
    if (!this.calendarNotes) this.loadCalendar();
    const list = this.calendarNotes.byDate[key];
    return Array.isArray(list) ? list : [];
  },

  addCalendarReminder(key, text) {
    const trimmed = String(text || '').trim();
    if (!key || !trimmed) return null;
    if (!this.calendarNotes) this.loadCalendar();
    if (!Array.isArray(this.calendarNotes.byDate[key])) {
      this.calendarNotes.byDate[key] = [];
    }
    const item = {
      id: 'cal-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      text: trimmed,
      done: false
    };
    this.calendarNotes.byDate[key].push(item);
    this.saveCalendar();
    return item;
  },

  toggleCalendarReminder(key, id) {
    if (!this.calendarNotes) this.loadCalendar();
    const list = this.calendarNotes.byDate[key];
    if (!Array.isArray(list)) return false;
    const item = list.find(i => i.id === id);
    if (!item) return false;
    item.done = !item.done;
    this.saveCalendar();
    return true;
  },

  updateCalendarReminder(key, id, newText) {
    const trimmed = String(newText || '').trim();
    if (!trimmed) return false;
    if (!this.calendarNotes) this.loadCalendar();
    const list = this.calendarNotes.byDate[key];
    if (!Array.isArray(list)) return false;
    const item = list.find(i => i.id === id);
    if (!item) return false;
    item.text = trimmed;
    this.saveCalendar();
    return true;
  },

  deleteCalendarReminder(key, id) {
    if (!this.calendarNotes) this.loadCalendar();
    const list = this.calendarNotes.byDate[key];
    if (!Array.isArray(list)) return false;
    this.calendarNotes.byDate[key] = list.filter(i => i.id !== id);
    if (this.calendarNotes.byDate[key].length === 0) {
      delete this.calendarNotes.byDate[key];
    }
    this.saveCalendar();
    return true;
  },

  addHoursEntry({ date, name, from, to, project, note }) {
    if (!date || !name || !from || !to) return false;
    const day = this.get(date);
    const projName = (project || '').trim() || 'Prace ogólne';
    this.ensureProject(projName);

    // Znajdź istniejącą pracę z tym projektem lub stwórz nową
    let job = day.jobs.find(j => (j.place || '').toLowerCase() === projName.toLowerCase());
    if (!job) {
      job = {
        place: projName,
        goal: '',
        tasks: [],
        status: 'plan',
        people: [],
        items: [],
        result: ''
      };
      day.jobs.push(job);
    }

    job.people.push({
      name: name.trim(),
      from: from,
      to: to,
      realFrom: from,
      realTo: to,
      note: (note || '').trim()
    });

    this.set(date, day);
    return true;
  },

  exportJson() {
    return JSON.stringify({
      days: this.data,
      reminders: this.reminders || this.loadReminders(),
      projectsMeta: this.projectsMeta || this.loadProjects(),
      calendarNotes: this.calendarNotes || this.loadCalendar()
    }, null, 2);
  },

  importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Zły format');
    if (parsed.days) {
      this.replaceAll(this.normalize(parsed.days));
      if (parsed.reminders) {
        this.reminders = parsed.reminders;
        this.saveReminders();
      }
      if (parsed.projectsMeta) {
        this.projectsMeta = {
          custom: Array.isArray(parsed.projectsMeta.custom) ? parsed.projectsMeta.custom : [],
          deleted: Array.isArray(parsed.projectsMeta.deleted) ? parsed.projectsMeta.deleted : []
        };
        this.saveProjects();
      }
      if (parsed.calendarNotes && typeof parsed.calendarNotes.byDate === 'object') {
        this.calendarNotes = { byDate: parsed.calendarNotes.byDate };
        this.saveCalendar();
      }
    } else {
      this.replaceAll(this.normalize(parsed));
    }
  },

  resetToSample() {
    this.replaceAll(buildSampleData(mondayOf()));
    this.reminders = this.defaultReminders();
    this.saveReminders();
  }
};
