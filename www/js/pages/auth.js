/* ── Auth Page ───────────────────────────────────────────────────── */
const AuthPage = (() => {

  /* ── Question bank ────────────────────────────────────────────── */
  const QUESTIONS = [
    // Childhood & growing up
    "What was the name of your first pet?",
    "What street did you grow up on?",
    "What was your childhood nickname?",
    "What was the name of your childhood best friend?",
    "What was your favorite subject in school?",
    "What was the name of your elementary school?",
    "What was the name of your first teacher?",
    "What city or town did you grow up in?",
    // Family
    "What is your mother's maiden name?",
    "What is the name of your oldest sibling?",
    "What is your oldest sibling's middle name?",
    "What city was your father born in?",
    "What is your grandmother's first name?",
    "In what city did your parents meet?",
    // Firsts & milestones
    "What was the make or model of your first car?",
    "What was the first concert you ever attended?",
    "What was the first album or song you bought?",
    "What was the name of your first employer?",
    "What was your first job title?",
    "What was the model of your first mobile phone?",
    // Favorites & memories
    "What was your favorite sports team growing up?",
    "What was your favorite food as a child?",
    "What was the name of your favorite childhood movie?",
    "What was the name of the street you lived on at age ten?",
    "What is the name of the hospital where you were born?",
  ];

  let activeTab = 'login';
  let regStep = 1;

  /* ── Forgot password state ──────────────────────────────────── */
  let fpEmail = '';
  let fpStep  = 1;

  function init() {
    populateQuestions();
    setupTabs();
    setupRegSteps();
    setupForms();
    setupPasswordToggles();
    setupPasswordStrength();
    setupForgotPassword();
    setupAdminZone();
    positionTabIndicator('login');
  }

  function setupAdminZone() {
    const logo = document.getElementById('auth-logo-tap');
    if (!logo) return;
    let tapCount = 0;
    let tapTimer = null;
    logo.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { tapCount = 0; }, 1500);
      if (tapCount >= 5) {
        tapCount = 0;
        switchTab('login');
        showAlert('login-alert', 'Admin access: sign in with your administrator credentials.', 'info');
        setTimeout(() => document.getElementById('login-email').focus(), 200);
      }
    });
  }

  /* ── Question dropdown ────────────────────────────────────────── */
  function populateQuestions() {
    const sel = document.getElementById('reg-question');
    QUESTIONS.forEach((q, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = q;
      sel.appendChild(opt);
    });
  }

  /* ── Tabs ─────────────────────────────────────────────────────── */
  function setupTabs() {
    document.querySelectorAll('.auth__tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  function switchTab(tab) {
    if (tab === activeTab) return;
    activeTab = tab;

    document.querySelectorAll('.auth__tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    document.querySelectorAll('.auth__form').forEach(f => {
      const isTarget = f.dataset.form === tab;
      f.classList.toggle('active', isTarget);
      if (isTarget) {
        f.style.animation = 'none';
        f.offsetHeight;
        f.style.animation = '';
      }
    });

    // Reset register to step 1 when switching back
    if (tab === 'register') goRegStep(1);
    positionTabIndicator(tab);
    clearAllAlerts();
  }

  function positionTabIndicator(tab) {
    const tabEl = document.querySelector(`.auth__tab[data-tab="${tab}"]`);
    const indicator = document.querySelector('.auth__tab-indicator');
    if (!tabEl || !indicator) return;
    indicator.style.left = tabEl.offsetLeft + 'px';
    indicator.style.width = tabEl.offsetWidth + 'px';
  }

  /* ── Registration multi-step ──────────────────────────────────── */
  function setupRegSteps() {
    document.getElementById('btn-reg-continue').addEventListener('click', handleRegContinue);
    document.getElementById('btn-reg-back').addEventListener('click', () => goRegStep(1));
  }

  function handleRegContinue() {
    const name     = document.getElementById('reg-name').value;
    const email    = document.getElementById('reg-email').value;
    const phone    = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const terms    = document.getElementById('reg-terms').checked;

    if (validateStep1(name, email, phone, password, terms)) goRegStep(2);
  }

  function goRegStep(step) {
    regStep = step;
    const body1 = document.getElementById('reg-body-1');
    const body2 = document.getElementById('reg-body-2');
    const ind1  = document.getElementById('reg-step-ind-1');
    const ind2  = document.getElementById('reg-step-ind-2');
    const fill  = document.getElementById('reg-step-line-fill');

    body1.classList.toggle('active', step === 1);
    body2.classList.toggle('active', step === 2);

    ind1.classList.toggle('active', step === 1);
    ind1.classList.toggle('done',   step === 2);
    ind2.classList.toggle('active', step === 2);
    fill.style.width = step === 2 ? '100%' : '0%';

    if (step === 2) {
      document.getElementById('reg-question').focus();
    }
  }

  /* ── Forms ────────────────────────────────────────────────────── */
  function setupForms() {
    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('form-register').addEventListener('submit', handleRegister);

    document.querySelectorAll('.form-input').forEach(input => {
      input.addEventListener('input', () => clearFieldError(input));
    });
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!validateLogin(email, password)) return;

    const btn = document.getElementById('btn-login');
    setLoading(btn, true);
    try {
      const session = await SpaccleDB.loginUser({ email, password });
      showAlert('login-alert', 'Welcome back, ' + session.name + '!', 'success');
      await delay(800);
      if (session.role === 'admin') {
        App.navigate('admin', { user: session });
      } else {
        App.navigate('home', { user: session });
      }
    } catch (err) {
      const msg = err.message === 'INVALID_CREDENTIALS'
        ? 'Incorrect email or password. Please try again.'
        : 'Something went wrong. Please try again.';
      showAlert('login-alert', msg, 'error');
    } finally {
      setLoading(btn, false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (regStep !== 2) return;

    const name     = document.getElementById('reg-name').value;
    const email    = document.getElementById('reg-email').value;
    const phone    = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const qIndex   = document.getElementById('reg-question').value;
    const answer   = document.getElementById('reg-answer').value;

    if (!validateStep2(qIndex, answer)) return;

    const recoveryQuestion = QUESTIONS[parseInt(qIndex)];
    const btn = document.getElementById('btn-register');
    setLoading(btn, true);

    try {
      await SpaccleDB.createUser({ name, email, phone, password, recoveryQuestion, recoveryAnswer: answer });
      const session = await SpaccleDB.loginUser({ email, password });
      showAlert('register-alert', 'Account created! Welcome to Spaccle.', 'success');
      await delay(900);
      App.navigate('home', { user: session });
    } catch (err) {
      if (err.message === 'EMAIL_TAKEN') {
        // Jump back to step 1 to show error on email field
        goRegStep(1);
        setFieldError('reg-email', 'reg-email-err', 'An account with this email already exists.');
      } else {
        showAlert('register-alert', 'Something went wrong. Please try again.', 'error');
      }
    } finally {
      setLoading(btn, false);
    }
  }

  /* ── Validation ───────────────────────────────────────────────── */
  function validateLogin(email, password) {
    let ok = true;
    if (!email || !isValidEmail(email)) {
      setFieldError('login-email', 'login-email-err', 'Enter a valid email address.');
      ok = false;
    }
    if (!password) {
      setFieldError('login-password', 'login-password-err', 'Enter your password.');
      ok = false;
    }
    return ok;
  }

  function validateStep1(name, email, phone, password, terms) {
    let ok = true;
    if (!name || name.trim().length < 2) {
      setFieldError('reg-name', 'reg-name-err', 'Enter your full name.');
      ok = false;
    }
    if (!email || !isValidEmail(email)) {
      setFieldError('reg-email', 'reg-email-err', 'Enter a valid email address.');
      ok = false;
    }
    if (!phone || phone.trim().length < 7) {
      setFieldError('reg-phone', 'reg-phone-err', 'Enter a valid phone number.');
      ok = false;
    }
    if (!password || password.length < 8) {
      setFieldError('reg-password', 'reg-password-err', 'Password must be at least 8 characters.');
      ok = false;
    }
    if (!terms) {
      document.getElementById('reg-terms-err').textContent = 'You must agree to continue.';
      ok = false;
    }
    return ok;
  }

  function validateStep2(qIndex, answer) {
    let ok = true;
    if (!qIndex) {
      document.getElementById('reg-question-err').textContent = 'Choose a security question.';
      ok = false;
    }
    if (!answer || answer.trim().length < 2) {
      setFieldError('reg-answer', 'reg-answer-err', 'Enter your answer.');
      ok = false;
    }
    return ok;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  /* ── Password toggles ─────────────────────────────────────────── */
  function setupPasswordToggles() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.form-toggle-pw');
      if (!btn) return;
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.classList.toggle('active', !isText);
    });
  }

  /* ── Password strength ────────────────────────────────────────── */
  function setupPasswordStrength() {
    document.getElementById('reg-password').addEventListener('input', e => {
      const { score, label, color } = getStrength(e.target.value);
      const fill = document.getElementById('pw-strength-fill');
      const lbl  = document.getElementById('pw-strength-label');
      fill.style.width = (score * 25) + '%';
      fill.style.background = color;
      lbl.textContent = e.target.value ? label : '';
      lbl.style.color = color;
    });
  }

  function getStrength(pw) {
    if (!pw) return { score: 0, label: '', color: '#E0E0E0' };
    let s = 0;
    if (pw.length >= 8)  s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^a-zA-Z0-9]/.test(pw)) s++;
    s = Math.min(4, s);
    const levels = [
      { label: 'Weak',    color: '#FF6B6B' },
      { label: 'Fair',    color: '#FFD166' },
      { label: 'Good',    color: '#06D6A0' },
      { label: 'Strong',  color: '#06D6A0' },
      { label: 'Perfect', color: '#5B4FBE' },
    ];
    return { score: s, ...levels[s] };
  }

  /* ── Forgot password ──────────────────────────────────────────── */
  function setupForgotPassword() {
    document.getElementById('btn-forgot').addEventListener('click', openForgot);
    document.getElementById('btn-forgot-close').addEventListener('click', closeForgot);
    document.getElementById('forgot-backdrop').addEventListener('click', closeForgot);
    document.getElementById('btn-fp-find').addEventListener('click', handleFpFind);
    document.getElementById('btn-fp-verify').addEventListener('click', handleFpVerify);
    document.getElementById('btn-fp-reset').addEventListener('click', handleFpReset);
    document.getElementById('btn-fp-done').addEventListener('click', () => { closeForgot(); switchTab('login'); });

    // Close on swipe-down
    const sheet = document.querySelector('.forgot-sheet');
    let startY = 0;
    sheet.addEventListener('touchstart', e => { startY = e.changedTouches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', e => {
      if (e.changedTouches[0].clientY - startY > 80) closeForgot();
    }, { passive: true });
  }

  function openForgot() {
    fpEmail = '';
    fpStep = 1;
    resetFpUI();
    document.getElementById('forgot-overlay').classList.add('open');
    setTimeout(() => document.getElementById('fp-email').focus(), 450);
  }

  function closeForgot() {
    document.getElementById('forgot-overlay').classList.remove('open');
  }

  function resetFpUI() {
    // Reset all steps
    document.querySelectorAll('.forgot-step').forEach(s => s.classList.remove('active'));
    document.getElementById('fp-step-1').classList.add('active');

    // Reset progress dots
    document.querySelectorAll('.forgot-progress__dot').forEach((d, i) => {
      d.classList.toggle('active', i === 0);
      d.classList.remove('done');
    });
    document.getElementById('fp-line-1').style.width = '0%';
    document.getElementById('fp-line-2').style.width = '0%';

    // Clear fields & errors
    ['fp-email', 'fp-answer', 'fp-newpw', 'fp-confirmpw'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['fp-email-err', 'fp-answer-err', 'fp-newpw-err', 'fp-confirmpw-err'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
    ['fp-step1-alert', 'fp-step2-alert', 'fp-step3-alert'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.className = 'auth__alert'; el.textContent = ''; }
    });
  }

  function advanceFpTo(step) {
    fpStep = step;
    document.querySelectorAll('.forgot-step').forEach(s => s.classList.remove('active'));
    document.getElementById('fp-step-' + step).classList.add('active');

    // Progress: step 2 = line 1 filled, step 3 = line 2 filled, step 4 = all filled
    const dots = document.querySelectorAll('.forgot-progress__dot');
    dots.forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i + 1 < step)      d.classList.add('done');
      else if (i + 1 === step) d.classList.add('active');
    });

    if (step >= 2) document.getElementById('fp-line-1').style.width = '100%';
    if (step >= 3) document.getElementById('fp-line-2').style.width = '100%';
  }

  async function handleFpFind() {
    const email = document.getElementById('fp-email').value.trim();
    if (!email || !isValidEmail(email)) {
      document.getElementById('fp-email-err').textContent = 'Enter a valid email address.';
      return;
    }

    const btn = document.getElementById('btn-fp-find');
    setLoading(btn, true);
    try {
      const question = await SpaccleDB.getRecoveryQuestion(email);
      // Always show step 2 — don't reveal if email exists or not
      fpEmail = email;
      document.getElementById('fp-question-text').textContent = question || 'What is your mother\'s maiden name?';
      advanceFpTo(2);
      setTimeout(() => document.getElementById('fp-answer').focus(), 300);
    } finally {
      setLoading(btn, false);
    }
  }

  async function handleFpVerify() {
    const answer = document.getElementById('fp-answer').value;
    if (!answer || answer.trim().length < 1) {
      document.getElementById('fp-answer-err').textContent = 'Enter your answer.';
      return;
    }

    const btn = document.getElementById('btn-fp-verify');
    setLoading(btn, true);
    try {
      const correct = await SpaccleDB.verifyRecoveryAnswer(fpEmail, answer);
      if (correct) {
        advanceFpTo(3);
        setTimeout(() => document.getElementById('fp-newpw').focus(), 300);
      } else {
        showAlert('fp-step2-alert', 'That answer doesn\'t match. Check for typos and try again.', 'error');
      }
    } finally {
      setLoading(btn, false);
    }
  }

  async function handleFpReset() {
    const pw      = document.getElementById('fp-newpw').value;
    const confirm = document.getElementById('fp-confirmpw').value;
    let ok = true;

    if (!pw || pw.length < 8) {
      document.getElementById('fp-newpw-err').textContent = 'Password must be at least 8 characters.';
      ok = false;
    }
    if (pw !== confirm) {
      document.getElementById('fp-confirmpw-err').textContent = 'Passwords do not match.';
      ok = false;
    }
    if (!ok) return;

    const btn = document.getElementById('btn-fp-reset');
    setLoading(btn, true);
    try {
      await SpaccleDB.resetPassword(fpEmail, pw);
      advanceFpTo(4);
    } catch {
      showAlert('fp-step3-alert', 'Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(btn, false);
    }
  }

  /* ── UI helpers ───────────────────────────────────────────────── */
  function setFieldError(inputId, errId, message) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errId);
    if (input) input.classList.add('has-error');
    if (err)   err.textContent = message;
  }

  function clearFieldError(input) {
    input.classList.remove('has-error');
    const errEl = document.getElementById(input.id + '-err');
    if (errEl) errEl.textContent = '';
  }

  function showAlert(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className = 'auth__alert show ' + type;
  }

  function clearAllAlerts() {
    document.querySelectorAll('.auth__alert').forEach(el => {
      el.className = 'auth__alert';
      el.textContent = '';
    });
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-input').forEach(el => el.classList.remove('has-error'));
  }

  function setLoading(btn, loading) {
    btn.classList.toggle('loading', loading);
  }

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  return { init };
})();
