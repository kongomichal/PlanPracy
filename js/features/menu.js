/* Menu: hasło, kopia danych, wylogowanie */
const Menu = {
  init() {
    $('menuBtn').addEventListener('click', () => { $('newPassword').value = ''; openModal('menuModal'); });
    $('savePasswordBtn').addEventListener('click', () => Auth.changePassword($('newPassword').value));
    $('logoutBtn').addEventListener('click', () => Auth.logout());

    $('exportBtn').addEventListener('click', () => {
      const blob = new Blob([Store.exportJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `muraven-plan-${dateKey(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('importInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importJson(reader.result);
          App.render();
          closeModal('menuModal');
          toast('Dane wczytane');
        } catch (err) { toast('Nie udało się wczytać pliku'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('resetBtn').addEventListener('click', () => {
      if (!confirm('Zastąpić wszystkie dane przykładowym planem?')) return;
      Store.resetToSample();
      App.render();
      closeModal('menuModal');
      toast('Wczytano przykładowy plan');
    });
  }
};
