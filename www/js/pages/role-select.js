/* ── Role Select Page ──────────────────────────────────────────────── */
const RoleSelectPage = (() => {
  const ROLE_KEY = 'selected_role';

  function init() {
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('btn-role-customer').addEventListener('click', () => selectRole('customer'));
    document.getElementById('btn-role-rider').addEventListener('click', () => selectRole('rider'));
    document.getElementById('btn-role-back').addEventListener('click', goBack);
  }

  async function selectRole(role) {
    await SpaccleDB.setPreference(ROLE_KEY, role);
    if (role === 'rider') {
      App.navigate('auth', { riderMode: true });
    } else {
      App.navigate('auth');
    }
  }

  function goBack() {
    App.navigate('onboarding');
  }

  return { init };
})();