/* ── Splash Page ─────────────────────────────────────────────────── */
const SplashPage = (() => {

  const MIN_DISPLAY = 2600; // ms — enough for loader animation

  async function init() {
    const start = Date.now();

    // Parallel: check session + check if onboarding has been seen
    const [session, onboardingDone] = await Promise.all([
      Promise.resolve(SpaccleDB.getSession()),
      SpaccleDB.getPreference('onboarding_complete', false),
    ]);

    const elapsed = Date.now() - start;
    const remaining = Math.max(0, MIN_DISPLAY - elapsed);

    await delay(remaining);

    if (session) {
      App.navigate('home');
    } else if (!onboardingDone) {
      App.navigate('onboarding');
    } else {
      App.navigate('auth');
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return { init };
})();
