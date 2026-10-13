/* Logowanie. Z Firebase: e-mail + hasło (dane chronione regułami bazy).
   Bez konfiguracji Firebase: prosta lokalna bramka hasłem (tylko ta przeglądarka). */
const Auth = {
  PASS_KEY: 'muraven_password_v2',
  LOGIN_KEY: 'muraven_logged_v2',
  DEFAULT: 'muraven123',

  password() { return localStorage.getItem(this.PASS_KEY) || this.DEFAULT; },
  isLogged() { return localStorage.getItem(this.LOGIN_KEY) === '1'; },

  init() {
    if (CLOUD_ENABLED) return this.initCloud();

    $('loginScreen').classList.toggle('hidden', this.isLogged());
    $('loginEmailWrap').hidden = true;
    $('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('loginPassword').value.trim() === this.password()) {
        localStorage.setItem(this.LOGIN_KEY, '1');
        $('loginScreen').classList.add('hidden');
        $('loginPassword').value = '';
        $('loginError').hidden = true;
      } else {
        $('loginError').hidden = false;
        $('loginPassword').select();
      }
    });
  },

  initCloud() {
    $('loginDefaultHint').hidden = true;
    $('passwordBlock').hidden = true;
    $('sharingText').textContent = 'Plan jest zapisany w chmurze i odświeża się na żywo u wszystkich zalogowanych osób.';

    firebase.auth().onAuthStateChanged((user) => {
      $('loginScreen').classList.toggle('hidden', !!user);
      if (user) Store.startSync(() => App.render());
      else { Store.stopSync(); App.render(); }
    });

    $('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      firebase.auth().signInWithEmailAndPassword($('loginEmail').value.trim(), $('loginPassword').value)
        .then(() => {
          $('loginPassword').value = '';
          $('loginError').hidden = true;
        })
        .catch(() => {
          $('loginError').textContent = 'Zły e-mail lub hasło.';
          $('loginError').hidden = false;
        });
    });
  },

  logout() {
    closeModal('menuModal');
    if (CLOUD_ENABLED) { firebase.auth().signOut(); return; }
    localStorage.removeItem(this.LOGIN_KEY);
    $('loginScreen').classList.remove('hidden');
  },

  changePassword(value) {
    const v = value.trim();
    if (!v) { toast('Hasło nie może być puste'); return; }
    localStorage.setItem(this.PASS_KEY, v);
    toast('Hasło zmienione');
  }
};
