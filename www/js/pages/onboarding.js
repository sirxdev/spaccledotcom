/* ── Onboarding Page ─────────────────────────────────────────────── */
const OnboardingPage = (() => {

  const TOTAL_SLIDES = 3;
  let currentSlide = 0;

  function init() {
    bindEvents();
    updateUI();
  }

  function bindEvents() {
    document.getElementById('btn-next').addEventListener('click', handleNext);
    document.getElementById('btn-skip').addEventListener('click', finish);

    document.querySelectorAll('.onboarding__dot').forEach(dot => {
      dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.dot)));
    });

    // Touch swipe support
    let touchStartX = 0;
    const slides = document.getElementById('onboarding-slides');

    slides.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });

    slides.addEventListener('touchend', e => {
      const delta = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) < 40) return;
      if (delta < 0 && currentSlide < TOTAL_SLIDES - 1) handleNext();
      if (delta > 0 && currentSlide > 0) goToSlide(currentSlide - 1);
    }, { passive: true });
  }

  function handleNext() {
    if (currentSlide < TOTAL_SLIDES - 1) {
      goToSlide(currentSlide + 1);
    } else {
      finish();
    }
  }

  function goToSlide(index) {
    if (index === currentSlide) return;

    const slides = document.querySelectorAll('.onboarding__slide');
    const from = slides[currentSlide];
    const to = slides[index];

    const goingForward = index > currentSlide;

    // Position incoming slide off-screen in the right direction
    to.style.transform = goingForward ? 'translateX(60px)' : 'translateX(-60px)';
    to.style.opacity = '0';
    to.style.pointerEvents = 'none';

    // Force reflow so transform is applied before transition
    to.offsetHeight; // eslint-disable-line no-unused-expressions

    // Slide out current
    from.classList.remove('active');
    from.style.transform = goingForward ? 'translateX(-60px)' : 'translateX(60px)';
    from.style.opacity = '0';
    from.style.pointerEvents = 'none';

    // Slide in new
    to.style.transform = '';
    to.style.opacity = '';
    to.classList.add('active');
    to.style.pointerEvents = '';

    currentSlide = index;
    updateUI();
  }

  function updateUI() {
    // Update dots
    document.querySelectorAll('.onboarding__dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentSlide);
    });

    // Update tab indicator
    updateTabIndicator();

    // Update next button
    const label = document.getElementById('btn-next-label');
    const btn = document.getElementById('btn-next');

    if (currentSlide === TOTAL_SLIDES - 1) {
      label.textContent = 'Get Started';
      btn.classList.add('get-started');
    } else {
      label.textContent = 'Next';
      btn.classList.remove('get-started');
    }

    // Show/hide skip
    const skipBtn = document.getElementById('btn-skip');
    skipBtn.style.visibility = currentSlide === TOTAL_SLIDES - 1 ? 'hidden' : 'visible';
  }

  function updateTabIndicator() {
    const dots = document.querySelectorAll('.onboarding__dot');
    const activeDot = dots[currentSlide];
    const indicator = document.querySelector('.onboarding__tab-indicator');
    if (!indicator || !activeDot) return;
    indicator.style.left = activeDot.offsetLeft + 'px';
    indicator.style.width = activeDot.offsetWidth + 'px';
  }

  async function finish() {
    await SpaccleDB.setPreference('onboarding_complete', true);
    App.navigate('auth');
  }

  return { init };
})();
