/* ── Splash Page ─────────────────────────────────────────────────── */
const SplashPage = (() => {

  const MIN_DISPLAY = 2600; // ms — enough for loader animation

  async function init() {
    try {
      console.log('Splash: starting...');
      
      // Check for existing session first
      const session = SpaccleDB.getSession();
      console.log('Splash: session =', session);
      
      if (session) {
        // Route based on role
        if (session.role === 'admin') {
          App.navigate('admin', { user: session });
        } else if (session.role === 'rider') {
          App.navigate('rider', { user: session });
        } else if (session.role === 'staff') {
          App.navigate('staff', { user: session });
        } else if (session.role === 'customer') {
          App.navigate('home', { user: session });
        } else {
          console.warn('Splash: unknown role', session.role, '— clearing session');
          SpaccleDB.logout();
          App.navigate('roleSelect');
        }
        return;
      }
      
      // Check onboarding done
      const onboardingDone = await SpaccleDB.getPreference('onboarding_complete');
      console.log('Splash: onboardingDone =', onboardingDone);
      
      if (!onboardingDone) {
        console.log('Splash: going to onboarding');
        App.navigate('onboarding');
      } else {
        console.log('Splash: going to roleSelect');
        App.navigate('roleSelect');
      }
    } catch (err) {
      console.error('Splash error:', err);
      App.navigate('onboarding');
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return { init };
})();
