/* Zapis i odczyt danych. Dziś: localStorage. Później łatwo podmienić na serwer.
   Dzień = { date, jobs: [ praca, praca, ... ] }
   Praca = { place, goal, status, people:[{name,from,to}], items:[{type,text,done}], result } */
const Store = {
  KEY: 'muraven_plan_v2',
  data: {},

  unsub: null,

  REMINDERS_KEY: 'muraven_reminders_v1',
  reminders: null,

  col() { return firebase.firestore().collection('days'); },

  load() {
    this.loadReminders();
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

      snap.forEach(doc => {
        if (doc.id === '_reminders') {
          cloudReminders = doc.data();
        } else {
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

      onChange();
    }, (err) => { console.error(err); toast('Brak połączenia z bazą danych'); });
  },

  stopSync() {
    if (this.unsub) this.unsub();
    this.unsub = null;
    if (CLOUD_ENABLED) {
      this.data = {};
      this.reminders = null;
    }
  },

  /** Zastępuje wszystkie dane w chmurze podanymi (nie naruszając przypomnień). */
  replaceAll(newData) {
    this.data = newData;
    if (!CLOUD_ENABLED) return this.save();
    const batch = firebase.firestore().batch();
    Object.keys(newData).forEach(k => {
      if (k !== '_reminders') batch.set(this.col().doc(k), newData[k]);
    });
    this.col().get().then(snap => {
      snap.forEach(doc => {
        if (doc.id !== '_reminders' && !newData[doc.id]) {
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

  addHoursEntry({ date, name, from, to, project }) {
    if (!date || !name || !from || !to) return false;
    const day = this.get(date);
    const projName = (project || '').trim() || 'Prace ogólne';

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
      realTo: to
    });

    this.set(date, day);
    return true;
  },

  exportJson() {
    return JSON.stringify({
      days: this.data,
      reminders: this.reminders || this.loadReminders()
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
