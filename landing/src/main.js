import './style.css';

/**
 * Scroll-driven animations: add .animate-in when element enters viewport.
 * Parallax: apply translateY to layers based on scroll (different speed factors).
 * Respects prefers-reduced-motion.
 */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initScrollAnimations() {
  if (REDUCED_MOTION) return;

  const baseHiddenClasses = ['opacity-0', 'transition-all', 'duration-700', 'ease-out'];
  const resetTranslateClasses = ['translate-y-10', '-translate-x-10', 'translate-x-10', 'scale-95'];
  const exitClasses = ['opacity-0', '-translate-y-8'];
  const visibleClasses = ['opacity-100', 'translate-y-0', 'translate-x-0', 'scale-100'];

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const el = entry.target;
        const rect = entry.boundingClientRect;
        const rootHeight = entry.rootBounds?.height ?? window.innerHeight;

        if (entry.isIntersecting) {
          el.classList.remove(...resetTranslateClasses, ...exitClasses);
          el.classList.add(...visibleClasses);
        } else {
          if (rect.bottom < 0) {
            el.classList.remove(...visibleClasses, ...resetTranslateClasses);
            el.classList.add(...exitClasses);
          } else if (rect.top > rootHeight) {
            const direction = el.dataset.animate || 'up';
            el.classList.remove(...visibleClasses, ...exitClasses);
            el.classList.add('opacity-0');
            if (direction === 'left') el.classList.add('-translate-x-10');
            else if (direction === 'right') el.classList.add('translate-x-10');
            else if (direction === 'scale') el.classList.add('scale-95');
            else el.classList.add('translate-y-10');
          }
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0 }
  );

  document.querySelectorAll('[data-animate]').forEach((el) => {
    const direction = el.dataset.animate || 'up';
    el.classList.add(...baseHiddenClasses);

    if (direction === 'left') {
      el.classList.add('-translate-x-10');
    } else if (direction === 'right') {
      el.classList.add('translate-x-10');
    } else if (direction === 'scale') {
      el.classList.add('scale-95');
    } else {
      el.classList.add('translate-y-10');
    }

    observer.observe(el);
  });

  // Hero in view on load: show hero content immediately to avoid layout jerk
  const hero = document.getElementById('hero');
  if (hero) {
    const rect = hero.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    if (inView) {
      hero.querySelectorAll('[data-animate]').forEach((el) => {
        el.classList.remove(...baseHiddenClasses, 'translate-y-10', '-translate-x-10', 'translate-x-10', 'scale-95');
        el.classList.add(...visibleClasses);
      });
    }
  }

  document.querySelectorAll('[data-animate-stagger]').forEach((container) => {
    const children = container.querySelectorAll('[data-animate-stagger-item]');
    const observerStagger = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const rect = entry.boundingClientRect;
          const rootHeight = entry.rootBounds?.height ?? window.innerHeight;

          if (entry.isIntersecting) {
            children.forEach((child, i) => {
              child.style.transitionDelay = `${i * 80}ms`;
              child.classList.remove('translate-y-10', 'opacity-0', '-translate-y-8');
              child.classList.add('opacity-100', 'translate-y-0');
            });
          } else {
            if (rect.bottom < 0) {
              children.forEach((child, i) => {
                child.style.transitionDelay = `${i * 40}ms`;
                child.classList.remove('opacity-100', 'translate-y-0');
                child.classList.add('opacity-0', '-translate-y-8');
              });
            } else if (rect.top > rootHeight) {
              children.forEach((child) => {
                child.style.transitionDelay = '';
                child.classList.remove('opacity-100', 'translate-y-0', '-translate-y-8');
                child.classList.add('opacity-0', 'translate-y-10');
              });
            }
          }
        });
      },
      { rootMargin: '0px 0px -5% 0px', threshold: 0 }
    );
    children.forEach((el) => {
      el.classList.add('opacity-0', 'translate-y-10', 'transition-all', 'duration-600', 'ease-out');
    });
    observerStagger.observe(container);
  });
}

function initParallax() {
  if (REDUCED_MOTION) return;

  const layers = document.querySelectorAll('[data-parallax]');
  if (!layers.length) return;

  let ticking = false;
  function update() {
    const scrollY = window.scrollY;
    const viewportCenter = scrollY + window.innerHeight / 2;

    layers.forEach((el) => {
      const factor = parseFloat(el.dataset.parallax || '0.15');
      const depth = parseFloat(el.dataset.parallaxDepth || '1');
      const rect = el.getBoundingClientRect();
      const elementCenter = rect.top + scrollY + rect.height / 2;
      const distance = elementCenter - viewportCenter;
      const y = -distance * factor * depth;
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    });
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );
  update();
}

function initTilt() {
  if (REDUCED_MOTION) return;

  const tiltElements = document.querySelectorAll('[data-tilt], [data-tilt-subtle]');
  if (!tiltElements.length) return;

  tiltElements.forEach((el) => {
    const maxTilt = el.hasAttribute('data-tilt-subtle') ? 5 : 12;
    el.style.transformStyle = 'preserve-3d';
    el.style.perspective = '1200px';
    el.style.transition = 'transform 0.2s ease-out';
    el.style.willChange = 'transform';

    function handleMove(e) {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const centerX = 0.5;
      const centerY = 0.5;
      const percentX = (x - centerX) * 2;
      const percentY = (y - centerY) * 2;
      const rotateY = Math.max(-1, Math.min(1, percentX)) * maxTilt;
      const rotateX = Math.max(-1, Math.min(1, -percentY)) * maxTilt;
      el.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    }

    function reset() {
      el.style.transform = 'rotateX(0deg) rotateY(0deg)';
    }

    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', reset);
  });
}

function initDevicesCarousel() {
  const carousel = document.getElementById('devices-carousel');
  const prevBtn = document.getElementById('devices-prev-btn');
  const nextBtn = document.getElementById('devices-next-btn');
  if (!carousel || !prevBtn || !nextBtn) return;
  const track = carousel.firstElementChild;
  if (!track) return;

  let ticking = false;
  const applyCenterScale = () => {
    const cards = track.querySelectorAll('.devices-card');
    const centerX = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
    const maxDistance = Math.max(carousel.clientWidth * 0.5, 1);

    cards.forEach((card) => {
      const imageWrap = card.querySelector('.devices-card-image');
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(centerX - cardCenter);
      const ratio = Math.min(distance / maxDistance, 1);
      const scale = 1.12 - ratio * 0.2;
      const opacity = 1 - ratio * 0.25;
      if (imageWrap) {
        imageWrap.style.transform = `scale(${scale.toFixed(3)})`;
      }
      card.style.opacity = `${opacity.toFixed(3)}`;
      card.style.zIndex = String(Math.round((1 - ratio) * 100));
    });
  };

  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        applyCenterScale();
        ticking = false;
      });
      ticking = true;
    }
  };

  carousel.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', applyCenterScale);

  const step = () => Math.max(carousel.clientWidth * 0.42, 240);
  prevBtn.addEventListener('click', () => {
    if (carousel.scrollLeft <= 8) {
      carousel.scrollLeft = carousel.scrollWidth - carousel.clientWidth - 8;
    }
    carousel.scrollBy({ left: -step(), behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', () => {
    const atEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 8;
    if (atEnd) {
      carousel.scrollLeft = 8;
    }
    carousel.scrollBy({ left: step(), behavior: 'smooth' });
  });

  applyCenterScale();
}

/**
 * Hero logo animation: start only when hero section enters viewport (not on page load).
 * Optional: set data-hero-logo-trigger="interaction" on the section to start on first scroll/click instead.
 */
function initHeroLogoAnimation() {
  if (REDUCED_MOTION) return;
  const hero = document.getElementById('hero');
  if (!hero) return;

  const trigger = hero.dataset.heroLogoTrigger || 'view';

  if (trigger === 'interaction') {
    const start = () => {
      hero.classList.add('hero-logo-animate');
      window.removeEventListener('scroll', start, { once: true, passive: true });
      document.removeEventListener('click', start, { once: true });
      document.removeEventListener('keydown', start, { once: true });
    };
    window.addEventListener('scroll', start, { passive: true });
    document.addEventListener('click', start);
    document.addEventListener('keydown', start);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      hero.classList.add('hero-logo-animate');
      observer.disconnect();
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0 }
  );
  observer.observe(hero);
}

document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initParallax();
  initTilt();
  initDevicesCarousel();
  initHeroLogoAnimation();
});
