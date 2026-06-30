/* ── Role Select Page ──────────────────────────────────────────────── */
const RoleSelectPage = (() => {
  const ROLE_KEY = 'selected_role';
  let selectedRole = null;

  function init() {
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('btn-role-customer').addEventListener('click', () => selectRole('customer'));
    document.getElementById('btn-role-rider').addEventListener('click', () => selectRole('rider'));
    document.getElementById('btn-role-back').addEventListener('click', goBack);
    document.getElementById('btn-role-continue').addEventListener('click', handleContinue);
  }

  function selectRole(role) {
    selectedRole = role;
    updateVisual(role);
    proceed(role);
  }

  function updateVisual(role) {
    const customerCheck = document.getElementById('check-customer');
    const riderCheck = document.getElementById('check-rider');
    if (role === 'customer') {
      customerCheck.className = 'role-card__check role-card__check--filled';
      riderCheck.className = 'role-card__check role-card__check--empty';
    } else {
      riderCheck.className = 'role-card__check role-card__check--filled';
      customerCheck.className = 'role-card__check role-card__check--empty';
    }
  }

  function handleContinue() {
    if (selectedRole) proceed(selectedRole);
  }

  function proceed(role) {
    SpaccleDB.setPreference(ROLE_KEY, role).then(() => {
      if (role === 'rider') {
        App.navigate('auth', { riderMode: true });
      } else {
        App.navigate('auth');
      }
    });
  }

  function goBack() {
    App.navigate('onboarding');
  }

  return { init };
})();
