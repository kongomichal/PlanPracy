/* Logowanie hasłem (prosta bramka – patrz uwaga w Menu o serwerze) */
const Auth = {
  PASS_KEY: 'muraven_password_v2',
  LOGIN_KEY: 'muraven_logged_v2',
  DEFAULT: 'muraven123',

  password() { return localStorage.getItem(this.PASS_KEY) || this.DEFAULT; },
  isLogged() { return localStorage.getItem(this.LOGIN_KEY) === '1'; },

  init() {
    $('loginScreen').classList.toggle('hidden', this.isLogged());

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

  logout() {
    localStorage.removeItem(this.LOGIN_KEY);
    $('loginScreen').classList.remove('hidden');
    closeModal('menuModal');
  },

  changePassword(value) {
    const v = value.trim();
    if (!v) { toast('Hasło nie może być puste'); return; }
    localStorage.setItem(this.PASS_KEY, v);
    toast('Hasło zmienione');
  }
};
