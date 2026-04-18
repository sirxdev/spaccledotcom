/* ── Spaccle App ─────────────────────────────────────────────────── *
 * SPA router and lifecycle orchestrator.
 * Pages: splash → onboarding → auth → home
 * ──────────────────────────────────────────────────────────────── */

const App = (() => {

  const pages = {
    splash:     { id: 'page-splash',     module: null },
    onboarding: { id: 'page-onboarding', module: null },
    auth:       { id: 'page-auth',       module: null },
    home:       { id: 'page-home',       module: null },
    admin:      { id: 'page-admin',      module: null },
  };

  let current = null;

  function earlySync() {
    try {
      const cfg = window.SpaccleConfig?.couchdb;
      if (cfg?.remoteUrl) {
        SpaccleDB.setSyncConfig({
          remoteUrl: cfg.remoteUrl,
          username: cfg.username || '',
          password: cfg.password || '',
          dbName: cfg.dbName || 'spacclelaundry_spaccle',
        }).then(() => SpaccleDB.startSync()).catch(() => {});
      }
    } catch {}
  }

  function init() {
    try {
      if (navigator && navigator.splashscreen && typeof navigator.splashscreen.hide === 'function') {
        navigator.splashscreen.hide();
      }
    } catch {}

    earlySync();

    pages.splash.module     = SplashPage;
    pages.onboarding.module = OnboardingPage;
    pages.auth.module       = AuthPage;
    pages.home.module       = HomePage;
    pages.admin.module      = AdminPage;

    try {
      const adminCfg = window.SpaccleConfig?.admin;
      if (adminCfg?.email && adminCfg?.password) {
        SpaccleDB.ensureAdminUser({ email: adminCfg.email, password: adminCfg.password, name: adminCfg.name }).catch(() => {});
      }
    } catch {}

    current = 'splash';
    SplashPage.init();
  }

  async function navigate(pageName, data = {}) {
    const nextPage = pages[pageName];
    if (!nextPage) return;

    const nextEl = document.getElementById(nextPage.id);
    if (!nextEl) return;

    // Exit current
    if (current && current !== pageName) {
      const curEl = document.getElementById(pages[current].id);
      if (curEl) {
        curEl.classList.add('exit');
        curEl.classList.remove('active');
        setTimeout(() => curEl.classList.remove('exit'), 500);
      }
    }

    await new Promise(r => setTimeout(r, 50));

    nextEl.classList.add('active');
    current = pageName;

    const module = nextPage.module;
    if (module && typeof module.init === 'function') {
      module.init(data);
    }

    if (pageName === 'auth') {
      setTimeout(() => {
        const el = document.getElementById('page-auth');
        if (el) el.scrollTop = 0;
      }, 100);
    }
  }

  function boot() {
    window.addEventListener('error', e => {
      try {
        const msg = (e && (e.message || e.error?.message)) || 'Unknown error';
        const pre = document.createElement('pre');
        pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#ffffff;color:#1C1B3A;padding:16px;white-space:pre-wrap;overflow:auto;font-family:monospace;font-size:12px;';
        pre.textContent = 'Spaccle failed to start:\n\n' + msg;
        document.body.appendChild(pre);
      } catch {}
    });

    window.addEventListener('unhandledrejection', e => {
      try {
        const msg = e && e.reason ? String(e.reason) : 'Unhandled rejection';
        const pre = document.createElement('pre');
        pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#ffffff;color:#1C1B3A;padding:16px;white-space:pre-wrap;overflow:auto;font-family:monospace;font-size:12px;';
        pre.textContent = 'Spaccle failed to start:\n\n' + msg;
        document.body.appendChild(pre);
      } catch {}
    });

    if (window.cordova) {
      document.addEventListener('deviceready', init, false);
    } else {
      document.addEventListener('DOMContentLoaded', init, false);
    }
  }

  boot();

  return { navigate };
})();
