/* Start aplikacji: łączy moduły i obsługuje kliknięcia */
const App = {
  render() {
    Plan.render();
    Items.render();
    People.render();
    Hours.render();
    DayEditor.refreshNameSuggestions();
    const todo = Items.todoCount();
    $('itemsBadge').textContent = todo || '';
  },

  showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  },

  init() {
    Store.load();
    Auth.init();
    Plan.init();
    DayEditor.init();
    Menu.init();
    JobView.init();
    Hours.init();

    $('prevBtn').addEventListener('click', () => { Plan.shift(-14); this.render(); });
    $('nextBtn').addEventListener('click', () => { Plan.shift(14); this.render(); });
    $('todayBtn').addEventListener('click', () => { Plan.goToday(); this.render(); });

    $('tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) this.showTab(tab.dataset.tab);
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

    this.render();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
