/* Start aplikacji: łączy moduły i obsługuje nawigację oraz kliknięcia */
const App = {
  currentModule: 'dashboard', // 'dashboard' | 'plan' | 'hours' | 'reminders'
  currentPlanTab: 'plan',    // 'plan' | 'items' | 'people'

  goTo(module) {
    this.currentModule = module;
    const isDash = module === 'dashboard';

    // Pokaż/ukryj przycisk powrotu i elementy podrzędne
    if ($('backToDashBtn')) $('backToDashBtn').hidden = isDash;
    if ($('planTabs')) $('planTabs').hidden = module !== 'plan';
    if ($('rangeNav')) $('rangeNav').hidden = module !== 'plan';

    // Przełącz widok główny
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
    });

    if (isDash) {
      $('view-dashboard')?.classList.add('active');
    } else if (module === 'plan') {
      this.showPlanTab(this.currentPlanTab);
    } else if (module === 'hours') {
      $('view-hours')?.classList.add('active');
    } else if (module === 'reminders') {
      $('view-reminders')?.classList.add('active');
    }

    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  showPlanTab(name) {
    this.currentPlanTab = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.view').forEach(v => {
      if (['view-plan', 'view-items', 'view-people'].includes(v.id)) {
        v.classList.toggle('active', v.id === `view-${name}`);
      }
    });
  },

  updateDashboardStats() {
    // 1. Statystyka planu
    const planStat = $('dashPlanStat');
    if (planStat) {
      const todayKey = dateKey(new Date());
      const todayJobs = Store.get(todayKey).jobs.length;
      planStat.textContent = todayJobs ? `${todayJobs} ${plural(todayJobs, 'praca', 'prace', 'prac')} na dziś` : '30 aktywnych dni roboczych';
    }

    // 2. Statystyka godzin
    const hoursStat = $('dashHoursStat');
    if (hoursStat) {
      const totalH = Hours.totalSum();
      hoursStat.textContent = totalH ? `Razem: ${fmtHours(totalH)}` : 'Dodaj nowe godziny';
    }

    // 3. Statystyka przypomnień
    const remStat = $('dashRemindersStat');
    if (remStat) {
      const activeCount = Reminders.activeCount();
      remStat.textContent = activeCount ? `${activeCount} ${plural(activeCount, 'aktywne zadanie', 'aktywne zadania', 'aktywnych zadań')}` : 'Wszystko zrobione 👍';
    }
  },

  render() {
    Plan.render();
    Items.render();
    People.render();
    Hours.render();
    Reminders.render();
    DayEditor.refreshNameSuggestions();
    const todo = Items.todoCount();
    if ($('itemsBadge')) $('itemsBadge').textContent = todo || '';
    this.updateDashboardStats();
  },

  init() {
    Store.load();
    Auth.init();
    Plan.init();
    DayEditor.init();
    Menu.init();
    JobView.init();
    Hours.init();
    Reminders.init();

    // Nawigacja z kafelków na pulpicie
    document.querySelectorAll('[data-nav]').forEach(card => {
      card.addEventListener('click', () => this.goTo(card.dataset.nav));
    });

    // Powrót do menu głównego
    $('backToDashBtn')?.addEventListener('click', () => this.goTo('dashboard'));
    $('mainLogoBtn')?.addEventListener('click', () => this.goTo('dashboard'));

    // Zakładki wewnątrz Planu
    $('planTabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) this.showPlanTab(tab.dataset.tab);
    });

    // Kliknięcie dnia / przycisku "Przenieś" / odklikania na planie
    $('view-plan').addEventListener('click', (e) => {
      const dismiss = e.target.closest('[data-dismiss]');
      if (dismiss) return Plan.dismissDay(dismiss.dataset.dismiss);
      const restore = e.target.closest('[data-restore]');
      if (restore) return Plan.restoreDay(restore.dataset.restore);
      const edit = e.target.closest('[data-edit]');
      if (edit) return DayEditor.open(edit.dataset.edit);
      const move = e.target.closest('[data-move]');
      if (move) return DayEditor.open(move.dataset.move, true, Number(move.dataset.jobMove));
      const card = e.target.closest('.day');
      if (!card) return;
      const job = e.target.closest('.job');
      if (job) return JobView.open(card.dataset.date, Number(job.dataset.job));
      if (!Store.get(card.dataset.date).jobs.length) DayEditor.open(card.dataset.date);
    });

    // Lista rzeczy
    $('onlyTodo').addEventListener('change', () => Items.render());
    $('copyItemsBtn').addEventListener('click', () => Items.copyText());
    $('itemsList').addEventListener('change', (e) => {
      const cb = e.target.closest('[data-toggle]');
      if (cb) Items.toggle(cb.dataset.toggle, Number(cb.dataset.job), Number(cb.dataset.index), cb.checked);
    });
    $('itemsList').addEventListener('click', (e) => {
      const head = e.target.closest('.items-day-head');
      if (head) DayEditor.open(head.dataset.date);
    });

    // Ekipa
    $('peopleList').addEventListener('click', (e) => {
      const line = e.target.closest('.person-line');
      if (line) JobView.open(line.dataset.date, Number(line.dataset.job));
    });

    // Zamykanie okien przyciskami [data-close]
    document.querySelectorAll('[data-close]').forEach(btn =>
      btn.addEventListener('click', () => btn.closest('.modal').classList.remove('open')));

    this.goTo('dashboard');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
