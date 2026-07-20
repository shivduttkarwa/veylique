(function () {
  function initFaq(root) {
    root.querySelectorAll('[data-veylique-faq-button]').forEach(function (button) {
      if (button.dataset.veyliqueFaqReady === 'true') return;
      button.dataset.veyliqueFaqReady = 'true';

      button.addEventListener('click', function () {
        var item = button.closest('.veylique-faq-item');
        var expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        if (item) item.classList.toggle('is-open', !expanded);
      });
    });
  }

  function readHeroConfig(hero) {
    var script = hero.querySelector('[data-veylique-hero-config]');
    if (!script) return {};

    try {
      return JSON.parse(script.textContent || '{}');
    } catch (error) {
      return {};
    }
  }

  function getCoverRect(image, width, height) {
    var imageRatio = image.width / image.height;
    var canvasRatio = width / height;
    var drawWidth;
    var drawHeight;
    var drawX;
    var drawY;

    if (imageRatio > canvasRatio) {
      drawHeight = height;
      drawWidth = drawHeight * imageRatio;
      drawX = (width - drawWidth) / 2;
      drawY = 0;
    } else {
      drawWidth = width;
      drawHeight = drawWidth / imageRatio;
      drawX = 0;
      drawY = (height - drawHeight) / 2;
    }

    return { x: drawX, y: drawY, width: drawWidth, height: drawHeight };
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function initHero(hero) {
    if (hero.dataset.veyliqueHeroReady === 'true') return;
    hero.dataset.veyliqueHeroReady = 'true';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canvas = hero.querySelector('[data-veylique-hero-canvas]');
    var label = hero.querySelector('[data-veylique-hero-label]');
    var scrollButton = hero.querySelector('[data-veylique-scroll-down]');
    var config = readHeroConfig(hero);
    var imageUrls = Array.isArray(config.images) ? config.images.filter(Boolean) : [];
    var labels = Array.isArray(config.labels) ? config.labels : [];
    var slideDuration = Number(config.slideDuration) || 3000;
    var transitionDuration = Number(config.transitionDuration) || 2000;

    window.requestAnimationFrame(function () {
      hero.classList.add('is-visible');
    });

    if (scrollButton && scrollButton.dataset.veyliqueScrollReady !== 'true') {
      scrollButton.dataset.veyliqueScrollReady = 'true';
      scrollButton.addEventListener('click', function () {
        window.scrollTo({
          top: hero.offsetTop + hero.offsetHeight,
          behavior: reduceMotion ? 'auto' : 'smooth'
        });
      });
    }

    if (reduceMotion || !canvas || !imageUrls.length) return;

    var context = canvas.getContext('2d', { alpha: false });
    if (!context) return;

    var baseLayer = document.createElement('canvas');
    var baseContext = baseLayer.getContext('2d', { alpha: false });
    var images = new Array(imageUrls.length);
    var width = 0;
    var height = 0;
    var dpr = 1;
    var currentIndex = 0;
    var nextIndex = 0;
    var crossfade = 0;
    var transitionStart = 0;
    var lastSlideTime = -1;
    var isTransitioning = false;
    var transitionDirection = 1;
    var transitionCount = 0;
    var labelChanged = false;
    var frameId = 0;
    var pointer = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      inside: false,
      moved: false,
      radius: 0,
      strength: 0,
      lastX: 0,
      lastY: 0,
      velocityX: 0,
      velocityY: 0,
      lastMoveTime: -Infinity
    };

    function setLabel(index) {
      if (!label) return;

      var nextLabel = String(labels[index] || labels[0] || label.textContent || '').trim();
      if (!nextLabel || label.textContent.trim() === nextLabel) return;

      label.classList.remove('is-changing');
      label.textContent = nextLabel;
      void label.offsetWidth;
      label.classList.add('is-changing');
    }

    function resizeCanvas() {
      var rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      baseLayer.width = canvas.width;
      baseLayer.height = canvas.height;
      baseContext.setTransform(dpr, 0, 0, dpr, 0, 0);

      pointer.radius = Math.min(width, height) * 0.11;
    }

    function firstLoadedIndex() {
      for (var i = 0; i < images.length; i += 1) {
        if (images[i] && images[i].naturalWidth) return i;
      }
      return -1;
    }

    function nextLoadedIndex(fromIndex) {
      for (var offset = 1; offset < images.length; offset += 1) {
        var index = (fromIndex + offset) % images.length;
        if (images[index] && images[index].naturalWidth) return index;
      }
      return fromIndex;
    }

    function applyBaseOverlay(targetContext) {
      var gradient = targetContext.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(11, 42, 31, 0.42)');
      gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.02)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
      targetContext.fillStyle = gradient;
      targetContext.fillRect(0, 0, width, height);
    }

    function drawWaveTransition(targetContext, currentImage, nextImage) {
      var currentRect = getCoverRect(currentImage, width, height);
      var nextRect = getCoverRect(nextImage, width, height);
      var now = performance.now() * 0.001;
      var amplitude = height * 0.092 * Math.sin(Math.PI * crossfade);
      var sweepX = transitionDirection === 1
        ? crossfade * (width + amplitude * 2) - amplitude
        : (1 - crossfade) * (width + amplitude * 2) - amplitude;

      function waveX(y) {
        return sweepX + amplitude * (
          0.65 * Math.sin(y * 0.01 + now * 1.9) +
          0.35 * Math.sin(y * 0.025 - now * 2.3)
        );
      }

      if (!labelChanged && label) {
        var heroRect = hero.getBoundingClientRect();
        var labelRect = label.getBoundingClientRect();
        var labelEdge = transitionDirection === 1
          ? labelRect.left - heroRect.left
          : labelRect.right - heroRect.left;
        var waveAtLabel = waveX(labelRect.top - heroRect.top + labelRect.height / 2);
        var crossed = transitionDirection === 1 ? waveAtLabel >= labelEdge : waveAtLabel <= labelEdge;
        if (crossed) {
          labelChanged = true;
          setLabel(nextIndex);
        }
      }

      targetContext.drawImage(currentImage, currentRect.x, currentRect.y, currentRect.width, currentRect.height);

      targetContext.save();
      targetContext.beginPath();
      if (transitionDirection === 1) {
        targetContext.moveTo(-2, -2);
        targetContext.lineTo(waveX(0), -2);
        for (var y = 0; y <= height + 2; y += 2) targetContext.lineTo(waveX(y), y);
        targetContext.lineTo(-2, height + 2);
      } else {
        targetContext.moveTo(width + 2, -2);
        targetContext.lineTo(waveX(0), -2);
        for (var yReverse = 0; yReverse <= height + 2; yReverse += 2) targetContext.lineTo(waveX(yReverse), yReverse);
        targetContext.lineTo(width + 2, height + 2);
      }
      targetContext.closePath();
      targetContext.clip();
      targetContext.drawImage(nextImage, nextRect.x, nextRect.y, nextRect.width, nextRect.height);
      targetContext.restore();

      var glowWidth = Math.max(12, height * 0.04 * Math.sin(Math.PI * crossfade));
      for (var glowY = 0; glowY < height; glowY += 2) {
        var x = waveX(glowY);
        var glow = targetContext.createLinearGradient(x - glowWidth, glowY, x + glowWidth, glowY);
        glow.addColorStop(0, 'rgba(255,255,255,0)');
        glow.addColorStop(0.5, 'rgba(255,255,255,0.07)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        targetContext.fillStyle = glow;
        targetContext.fillRect(x - glowWidth, glowY, glowWidth * 2, 2);
      }
    }

    function drawBase() {
      var currentImage = images[currentIndex];
      if (!currentImage || !currentImage.naturalWidth) return false;

      baseContext.save();
      baseContext.clearRect(0, 0, width, height);

      if (isTransitioning && images[nextIndex] && images[nextIndex].naturalWidth) {
        drawWaveTransition(baseContext, currentImage, images[nextIndex]);
      } else {
        var rect = getCoverRect(currentImage, width, height);
        baseContext.drawImage(currentImage, rect.x, rect.y, rect.width, rect.height);
      }

      applyBaseOverlay(baseContext);
      baseContext.restore();
      return true;
    }

    function drawPointerDeformation() {
      if (!pointer.moved) return;

      pointer.x += (pointer.tx - pointer.x) * 0.16;
      pointer.y += (pointer.ty - pointer.y) * 0.16;
      pointer.velocityX = pointer.x - pointer.lastX;
      pointer.velocityY = pointer.y - pointer.lastY;
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;

      var now = performance.now();
      var moving = pointer.inside && now - pointer.lastMoveTime < 72;
      pointer.strength += ((moving ? 1 : 0) - pointer.strength) * 0.14;
      if (pointer.strength < 0.01) return;

      var time = now * 0.0012;
      var scaleX = baseLayer.width / width;
      var scaleY = baseLayer.height / height;
      var speed = Math.hypot(pointer.velocityX, pointer.velocityY);
      var flow = Math.min(1, speed / 36);
      var radiusX = pointer.radius * (1 + 0.04 * pointer.strength);
      var radiusY = pointer.radius * (0.9 + 0.02 * Math.sin(time * 1.1));

      context.save();
      context.imageSmoothingEnabled = true;

      for (var y = pointer.y - radiusY; y <= pointer.y + radiusY; y += 1) {
        var dy = y - pointer.y;
        var normalY = dy / radiusY;
        if (Math.abs(normalY) >= 1) continue;

        var core = Math.max(0, 1 - normalY * normalY);
        var halfWidth = radiusX * Math.sqrt(core);
        if (halfWidth < 1.2) continue;

        var stripX = pointer.x - halfWidth;
        var stripWidth = halfWidth * 2;
        var falloff = Math.pow(core, 2.5);
        var offsetX =
          Math.sin(dy * 0.018 - time * 2.4 + pointer.x * 0.0018) * radiusX * 0.032 * falloff +
          Math.cos(dy * 0.031 + time * 1.55) * radiusX * (0.017 + 0.01 * flow) * falloff +
          pointer.velocityX * (0.28 + flow * 0.34) * falloff +
          normalY * pointer.velocityX * 0.06 * falloff;
        var offsetY =
          Math.sin(dy * 0.02 - time * 2.1) * radiusY * 0.012 * falloff +
          pointer.velocityY * 0.06 * falloff;

        var sourceX = (stripX - offsetX) * scaleX;
        var sourceY = (y - offsetY) * scaleY;
        var sourceWidth = stripWidth * scaleX;
        var sourceHeight = scaleY;

        if (
          sourceX < 0 ||
          sourceY < 0 ||
          sourceX + sourceWidth > baseLayer.width ||
          sourceY + sourceHeight > baseLayer.height
        ) {
          continue;
        }

        context.globalAlpha = 0.92 + falloff * 0.08;
        context.drawImage(baseLayer, sourceX, sourceY, sourceWidth, sourceHeight, stripX, y, stripWidth, 1.2);
      }

      context.restore();
    }

    function drawNoise() {
      context.save();
      context.globalAlpha = 0.03;
      context.fillStyle = '#fff';
      for (var i = 0; i < 70; i += 1) {
        context.fillRect(Math.random() * width, Math.random() * height, Math.random() * 1.1, Math.random() * 1.1);
      }
      context.restore();
    }

    function render(timestamp) {
      if (!hero.isConnected) {
        window.cancelAnimationFrame(frameId);
        return;
      }

      if (!width || !height) resizeCanvas();

      var firstIndex = firstLoadedIndex();
      if (firstIndex < 0) {
        context.fillStyle = '#183b2e';
        context.fillRect(0, 0, width, height);
        frameId = window.requestAnimationFrame(render);
        return;
      }

      if (!images[currentIndex] || !images[currentIndex].naturalWidth) {
        currentIndex = firstIndex;
        setLabel(currentIndex);
      }

      if (lastSlideTime < 0) lastSlideTime = timestamp;

      if (!isTransitioning && timestamp - lastSlideTime > slideDuration) {
        nextIndex = nextLoadedIndex(currentIndex);
        if (nextIndex !== currentIndex) {
          isTransitioning = true;
          transitionStart = timestamp;
          transitionDirection = transitionCount % 2 === 0 ? 1 : -1;
          transitionCount += 1;
          labelChanged = false;
        } else {
          lastSlideTime = timestamp;
        }
      }

      if (isTransitioning) {
        var raw = Math.min(1, (timestamp - transitionStart) / transitionDuration);
        crossfade = easeInOut(raw);

        if (raw > 0.55 && !labelChanged) {
          labelChanged = true;
          setLabel(nextIndex);
        }

        if (raw >= 1) {
          currentIndex = nextIndex;
          isTransitioning = false;
          crossfade = 0;
          lastSlideTime = timestamp;
        }
      }

      if (drawBase()) {
        context.clearRect(0, 0, width, height);
        context.drawImage(baseLayer, 0, 0, baseLayer.width, baseLayer.height, 0, 0, width, height);
        drawPointerDeformation();
        drawNoise();
      }

      frameId = window.requestAnimationFrame(render);
    }

    function setPointer(event) {
      var rect = canvas.getBoundingClientRect();
      pointer.tx = event.clientX - rect.left;
      pointer.ty = event.clientY - rect.top;
      pointer.moved = true;
      pointer.lastMoveTime = performance.now();
    }

    imageUrls.forEach(function (url, index) {
      var image = new Image();
      image.onload = function () {
        images[index] = image;
        if (index === 0) resizeCanvas();
      };
      image.src = url;
    });

    window.addEventListener('resize', resizeCanvas);
    hero.addEventListener('pointermove', setPointer);
    hero.addEventListener('pointerenter', function (event) {
      var rect = canvas.getBoundingClientRect();
      pointer.inside = true;
      pointer.tx = event.clientX - rect.left;
      pointer.ty = event.clientY - rect.top;
    });
    hero.addEventListener('pointerleave', function () {
      pointer.inside = false;
    });

    resizeCanvas();
    frameId = window.requestAnimationFrame(render);
  }

  function initHeroes(root) {
    root.querySelectorAll('[data-veylique-hero]').forEach(initHero);
  }

  function setInert(element, inert) {
    if (!element) return;

    if (inert) {
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
    } else {
      element.setAttribute('aria-hidden', 'false');
      element.removeAttribute('inert');
    }
  }

  function initHeader(root) {
    root.querySelectorAll('[data-veylique-header]').forEach(function (header) {
      if (header.dataset.veyliqueHeaderReady === 'true') return;
      header.dataset.veyliqueHeaderReady = 'true';

      var sectionRoot = header.closest('.shopify-section') || document;
      var navToggle = sectionRoot.querySelector('[data-veylique-nav-toggle]');
      var mobileNav = sectionRoot.querySelector('[data-veylique-mobile-nav]');
      var searchOverlay = sectionRoot.querySelector('[data-veylique-search-overlay]');
      var searchTriggers = sectionRoot.querySelectorAll('[data-veylique-search-trigger]');
      var searchCloses = sectionRoot.querySelectorAll('[data-veylique-search-close]');
      var searchInput = sectionRoot.querySelector('[data-veylique-search-input]');
      var searchClear = sectionRoot.querySelector('[data-veylique-search-clear]');
      var accountWrap = sectionRoot.querySelector('[data-veylique-account-wrap]');
      var accountTrigger = sectionRoot.querySelector('[data-veylique-account-trigger]');
      var accountDropdown = sectionRoot.querySelector('[data-veylique-account-dropdown]');

      function syncHeaderScroll() {
        header.classList.toggle('is-scrolled', window.scrollY > 24);
      }

      function setMobileOrigin() {
        if (!navToggle || !mobileNav) return;
        var rect = navToggle.getBoundingClientRect();
        mobileNav.style.setProperty('--veylique-mobile-nav-origin-x', rect.left + rect.width / 2 + 'px');
        mobileNav.style.setProperty('--veylique-mobile-nav-origin-y', rect.top + rect.height / 2 + 'px');
      }

      function openMobileNav() {
        if (!mobileNav || !navToggle) return;
        setMobileOrigin();
        mobileNav.classList.add('is-open');
        navToggle.classList.add('is-open');
        navToggle.setAttribute('aria-expanded', 'true');
        setInert(mobileNav, false);
        document.body.classList.add('veylique-nav-open');
      }

      function closeMobileNav() {
        if (!mobileNav || !navToggle) return;
        mobileNav.classList.remove('is-open');
        navToggle.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        setInert(mobileNav, true);
        document.body.classList.remove('veylique-nav-open');
      }

      function openSearch() {
        if (!searchOverlay) return;
        searchOverlay.classList.add('is-open');
        setInert(searchOverlay, false);
        document.body.classList.add('veylique-search-open');
        searchTriggers.forEach(function (trigger) {
          trigger.setAttribute('aria-expanded', 'true');
        });
        window.setTimeout(function () {
          if (searchInput) searchInput.focus();
        }, 80);
      }

      function closeSearch() {
        if (!searchOverlay) return;
        searchOverlay.classList.remove('is-open');
        setInert(searchOverlay, true);
        document.body.classList.remove('veylique-search-open');
        searchTriggers.forEach(function (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
        });
      }

      function updateSearchClear() {
        if (!searchInput || !searchClear) return;
        searchClear.hidden = searchInput.value.length === 0;
      }

      function closeAccount() {
        if (!accountTrigger || !accountDropdown) return;
        accountDropdown.classList.remove('is-open');
        accountTrigger.setAttribute('aria-expanded', 'false');
        setInert(accountDropdown, true);
      }

      function openAccount() {
        if (!accountTrigger || !accountDropdown) return;
        accountDropdown.classList.add('is-open');
        accountTrigger.setAttribute('aria-expanded', 'true');
        setInert(accountDropdown, false);
      }

      window.requestAnimationFrame(function () {
        header.classList.add('is-ready');
        syncHeaderScroll();
      });

      window.addEventListener('scroll', syncHeaderScroll, { passive: true });
      window.addEventListener('resize', setMobileOrigin);

      if (navToggle && mobileNav) {
        setInert(mobileNav, true);
        navToggle.addEventListener('click', function () {
          if (mobileNav.classList.contains('is-open')) closeMobileNav();
          else openMobileNav();
        });

        mobileNav.querySelectorAll('a').forEach(function (link) {
          link.addEventListener('click', closeMobileNav);
        });
      }

      if (searchOverlay) {
        setInert(searchOverlay, true);
        searchTriggers.forEach(function (trigger) {
          trigger.addEventListener('click', openSearch);
        });
        searchCloses.forEach(function (close) {
          close.addEventListener('click', closeSearch);
        });
        if (searchInput) {
          searchInput.addEventListener('input', updateSearchClear);
          updateSearchClear();
        }
        if (searchClear) {
          searchClear.addEventListener('click', function () {
            if (!searchInput) return;
            searchInput.value = '';
            updateSearchClear();
            searchInput.focus();
          });
        }
      }

      if (accountTrigger && accountDropdown) {
        setInert(accountDropdown, true);
        accountTrigger.addEventListener('click', function () {
          if (accountDropdown.classList.contains('is-open')) closeAccount();
          else openAccount();
        });
      }

      document.addEventListener('click', function (event) {
        if (accountWrap && !accountWrap.contains(event.target)) closeAccount();
      });

      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        closeMobileNav();
        closeSearch();
        closeAccount();
      });
    });
  }

  function initFooter(root) {
    root.querySelectorAll('[data-veylique-footer]').forEach(function (footer) {
      if (footer.dataset.veyliqueFooterReady === 'true') return;
      footer.dataset.veyliqueFooterReady = 'true';

      if (!('IntersectionObserver' in window)) {
        footer.classList.add('is-visible');
        return;
      }

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          footer.classList.add('is-visible');
          observer.disconnect();
        });
      }, { threshold: 0.18 });

      observer.observe(footer);
    });
  }

  function initCategoryCarousels(root) {
    root.querySelectorAll('[data-veylique-category-carousel]').forEach(function (carousel) {
      if (carousel.dataset.veyliqueCategoryReady === 'true') return;
      carousel.dataset.veyliqueCategoryReady = 'true';

      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var intro = carousel.querySelector('[data-veylique-category-intro]');
      var scroller = carousel.querySelector('[data-veylique-cat-track]');
      var prev = carousel.querySelector('[data-veylique-cat-prev]');
      var next = carousel.querySelector('[data-veylique-cat-next]');
      var dragState = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        startScrollLeft: 0,
        didDrag: false,
        suppressClickUntil: 0
      };

      carousel.querySelectorAll('[data-veylique-hover-image]').forEach(function (image) {
        function markLoaded() {
          image.classList.add('is-loaded');
        }

        if (image.complete && image.naturalWidth) markLoaded();
        else image.addEventListener('load', markLoaded, { once: true });
      });

      function reveal(element) {
        if (element) element.classList.add('is-visible');
      }

      if (!('IntersectionObserver' in window)) {
        reveal(intro);
        carousel.querySelectorAll('.veylique-reveal-js').forEach(reveal);
      } else {
        if (intro) {
          var introObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              reveal(entry.target);
              introObserver.unobserve(entry.target);
            });
          }, { threshold: 0.15, rootMargin: '0px 0px -12% 0px' });

          introObserver.observe(intro);
        }

        var revealObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            revealObserver.unobserve(entry.target);
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

        carousel.querySelectorAll('.veylique-reveal-js').forEach(function (card) {
          revealObserver.observe(card);
        });
      }

      if (!scroller) return;

      var wrapper = scroller.querySelector('.swiper-wrapper');
      if (!wrapper) return;

      var slides = [];
      var activeIndex = 0;
      var currentTranslate = 0;
      var targetTranslate = 0;
      var minTranslate = 0;
      var maxIndex = 0;
      var slideStep = 0;
      var animationFrame = 0;

      function clampTranslate(value) {
        return Math.min(0, Math.max(minTranslate, value));
      }

      function indexToTranslate(index) {
        return clampTranslate(-index * slideStep);
      }

      function translateToIndex(value) {
        if (!slideStep) return 0;
        return Math.min(maxIndex, Math.max(0, Math.round(Math.abs(clampTranslate(value)) / slideStep)));
      }

      function setTranslate(value) {
        wrapper.style.transform = 'translate3d(' + value + 'px, 0, 0)';
      }

      function stopAnimation() {
        if (!animationFrame) return;
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      function easeOutCubic(progress) {
        return 1 - Math.pow(1 - progress, 3);
      }

      function updateNav() {
        var atStart = targetTranslate >= -1;
        var atEnd = targetTranslate <= minTranslate + 1 || activeIndex >= maxIndex;

        if (prev) {
          prev.classList.toggle('swiper-button-disabled', atStart);
          prev.disabled = atStart;
        }

        if (next) {
          next.classList.toggle('swiper-button-disabled', atEnd);
          next.disabled = atEnd;
        }
      }

      function animateTo(value, duration) {
        stopAnimation();

        targetTranslate = clampTranslate(value);

        if (reduceMotion || !duration) {
          currentTranslate = targetTranslate;
          activeIndex = translateToIndex(targetTranslate);
          setTranslate(currentTranslate);
          updateNav();
          return;
        }

        var from = currentTranslate;
        var to = targetTranslate;
        var start = performance.now();

        function tick(now) {
          var progress = Math.min(1, (now - start) / duration);
          currentTranslate = from + (to - from) * easeOutCubic(progress);
          setTranslate(currentTranslate);

          if (progress < 1) {
            animationFrame = window.requestAnimationFrame(tick);
            return;
          }

          animationFrame = 0;
          currentTranslate = to;
          activeIndex = translateToIndex(to);
          setTranslate(currentTranslate);
          updateNav();
        }

        animationFrame = window.requestAnimationFrame(tick);
        updateNav();
      }

      function slideTo(index, duration) {
        activeIndex = Math.min(maxIndex, Math.max(0, index));
        animateTo(indexToTranslate(activeIndex), duration);
      }

      function slideByDirection(direction) {
        slideTo(activeIndex + direction, 680);
      }

      function measureSlider() {
        slides = Array.prototype.slice.call(wrapper.querySelectorAll('.swiper-slide'));

        if (!slides.length) {
          minTranslate = 0;
          maxIndex = 0;
          slideStep = 0;
          setTranslate(0);
          updateNav();
          return;
        }

        var styles = window.getComputedStyle(wrapper);
        var gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
        var firstSlide = slides[0];
        var lastSlide = slides[slides.length - 1];
        var totalWidth = lastSlide.offsetLeft - firstSlide.offsetLeft + lastSlide.offsetWidth;

        slideStep = firstSlide.getBoundingClientRect().width + gap;
        minTranslate = Math.min(0, scroller.clientWidth - totalWidth);
        maxIndex = slideStep ? Math.ceil(Math.abs(minTranslate) / slideStep) : 0;
        activeIndex = Math.min(maxIndex, Math.max(0, activeIndex));
        currentTranslate = indexToTranslate(activeIndex);
        targetTranslate = currentTranslate;
        setTranslate(currentTranslate);
        updateNav();
      }

      function endDrag(event) {
        if (!dragState.active) return;

        if (event && scroller.releasePointerCapture) {
          try {
            scroller.releasePointerCapture(dragState.pointerId);
          } catch (error) {
            // The pointer can already be released if the browser cancels the gesture.
          }
        }

        scroller.classList.remove('is-pointer-down', 'is-dragging');

        if (dragState.didDrag) {
          dragState.suppressClickUntil = Date.now() + 320;
          var velocity = Math.max(-2.4, Math.min(2.4, dragState.velocity || 0));
          var projectedTranslate = currentTranslate + velocity * 420;
          slideTo(translateToIndex(projectedTranslate), 680);
        } else {
          animateTo(targetTranslate, 260);
        }

        dragState.active = false;
        dragState.pointerId = null;
      }

      scroller.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || !event.isPrimary || !maxIndex) return;
        if (event.target.closest('[data-veylique-cat-prev], [data-veylique-cat-next]')) return;

        stopAnimation();
        dragState.active = true;
        dragState.pointerId = event.pointerId;
        dragState.startX = event.clientX;
        dragState.startY = event.clientY;
        dragState.startTranslate = currentTranslate;
        dragState.lastX = event.clientX;
        dragState.lastTime = performance.now();
        dragState.velocity = 0;
        dragState.didDrag = false;
        scroller.classList.add('is-pointer-down');

        if (scroller.setPointerCapture) {
          scroller.setPointerCapture(event.pointerId);
        }
      });

      scroller.addEventListener('pointermove', function (event) {
        if (!dragState.active || event.pointerId !== dragState.pointerId) return;

        var deltaX = event.clientX - dragState.startX;
        var deltaY = event.clientY - dragState.startY;
        var isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 4;

        if (!dragState.didDrag && !isHorizontal) return;

        dragState.didDrag = true;
        scroller.classList.add('is-dragging');
        event.preventDefault();

        var nextTranslate = dragState.startTranslate + deltaX;

        if (nextTranslate > 0) {
          nextTranslate *= 0.28;
        } else if (nextTranslate < minTranslate) {
          nextTranslate = minTranslate + (nextTranslate - minTranslate) * 0.28;
        }

        currentTranslate = nextTranslate;
        targetTranslate = clampTranslate(nextTranslate);
        setTranslate(currentTranslate);

        var now = performance.now();
        var elapsed = now - dragState.lastTime;
        if (elapsed > 0) {
          dragState.velocity = (event.clientX - dragState.lastX) / elapsed;
          dragState.lastX = event.clientX;
          dragState.lastTime = now;
        }
      });

      scroller.addEventListener('pointerup', endDrag);
      scroller.addEventListener('pointercancel', endDrag);
      scroller.addEventListener('lostpointercapture', endDrag);

      scroller.addEventListener('click', function (event) {
        if (Date.now() > dragState.suppressClickUntil) return;

        event.preventDefault();
        event.stopPropagation();
      }, true);

      if (prev) {
        prev.addEventListener('click', function () {
          slideByDirection(-1);
        });
      }

      if (next) {
        next.addEventListener('click', function () {
          slideByDirection(1);
        });
      }

      scroller.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        slideByDirection(event.key === 'ArrowRight' ? 1 : -1);
      });

      var resizeFrame = 0;
      window.addEventListener('resize', function () {
        if (resizeFrame) return;
        resizeFrame = window.requestAnimationFrame(function () {
          resizeFrame = 0;
          measureSlider();
        });
      });

      measureSlider();
    });
  }

  function initReveals(root) {
    var elements = Array.prototype.slice.call(root.querySelectorAll('.veylique-section-intro-js, .veylique-reveal-js'));
    if (!elements.length) return;

    function reveal(element) {
      element.classList.add('is-visible');
    }

    if (!('IntersectionObserver' in window)) {
      elements.forEach(reveal);
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    elements.forEach(function (element) {
      if (element.classList.contains('is-visible')) return;
      observer.observe(element);
    });
  }

  function initProductCards(root) {
    root.querySelectorAll('.veylique-best-img--hover, .veylique-lp-img--hover').forEach(function (image) {
      if (image.dataset.veyliqueHoverReady === 'true') return;
      image.dataset.veyliqueHoverReady = 'true';

      function markLoaded() {
        image.classList.add('is-loaded');
      }

      if (image.complete && image.naturalWidth) markLoaded();
      else image.addEventListener('load', markLoaded, { once: true });
    });

    root.querySelectorAll('[data-veylique-wish]').forEach(function (button) {
      if (button.dataset.veyliqueWishReady === 'true') return;
      button.dataset.veyliqueWishReady = 'true';

      button.addEventListener('click', function () {
        var active = !button.classList.contains('is-wished');
        button.classList.toggle('is-wished', active);
        button.setAttribute('aria-pressed', String(active));
      });
    });

    root.querySelectorAll('.veylique-size-row').forEach(function (row) {
      if (row.dataset.veyliqueSizeReady === 'true') return;
      row.dataset.veyliqueSizeReady = 'true';

      row.querySelectorAll('.veylique-size-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          row.querySelectorAll('.veylique-size-chip').forEach(function (otherChip) {
            otherChip.classList.toggle('is-selected', otherChip === chip);
            otherChip.setAttribute('aria-pressed', String(otherChip === chip));
          });
        });
      });
    });
  }

  function initArrivals(root) {
    root.querySelectorAll('[data-veylique-arrivals]').forEach(function (section) {
      if (section.dataset.veyliqueArrivalsReady === 'true') return;
      section.dataset.veyliqueArrivalsReady = 'true';

      var stage = section.querySelector('.veylique-slider-stage');
      var slidesRoot = section.querySelector('.veylique-slides');
      var slides = Array.prototype.slice.call(section.querySelectorAll('[data-veylique-arrivals-slide]'));
      var card = section.querySelector('.veylique-content-card');
      var numberEl = section.querySelector('[data-veylique-arrivals-number]');
      var textEl = section.querySelector('[data-veylique-arrivals-text]');
      var cardButton = section.querySelector('[data-veylique-arrivals-link]');
      var cursorArrow = section.querySelector('.veylique-cursor-arrow');
      var controls = Array.prototype.slice.call(section.querySelectorAll('[data-direction]'));

      if (!stage || !slidesRoot || !slides.length) {
        if (stage) stage.style.display = 'none';
        return;
      }

      var activeIndex = 0;
      var cursorSide = 'right';
      var isCursorBlocked = false;
      var activeAnimations = [];
      var lastMouseX = -1;
      var lastMouseY = -1;
      var touchStartX = 0;
      var touchStartY = 0;
      var touchDeltaX = 0;
      var isSwiping = false;
      var cardSwapHandler = null;
      var cardSwapTimer = null;
      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var SWIPE_THRESHOLD = 40;
      var CARD_FADE_MS = 560;

      function preloadImages() {
        return Promise.all(slides.map(function (slide) {
          return new Promise(function (resolve) {
            var slideImage = slide.querySelector('img');
            if (!slideImage) {
              resolve();
              return;
            }

            var source = slideImage.currentSrc || slideImage.getAttribute('src') || slideImage.src;
            if (!source) {
              resolve();
              return;
            }

            if (slideImage.complete && slideImage.naturalWidth) {
              resolve();
              return;
            }

            var preload = new Image();
            preload.onload = resolve;
            preload.onerror = resolve;
            preload.src = source;
          });
        }));
      }

      function updateSlides() {
        slides.forEach(function (slide, index) {
          var delta = index - activeIndex;
          slide.classList.remove('is-active', 'is-prev', 'is-next', 'is-hidden-left', 'is-hidden-right');
          if (delta === 0) slide.classList.add('is-active');
          else if (delta === -1) slide.classList.add('is-prev');
          else if (delta === 1) slide.classList.add('is-next');
          else if (delta < 0) slide.classList.add('is-hidden-left');
          else slide.classList.add('is-hidden-right');
        });
      }

      function updateCard() {
        var slide = slides[activeIndex];
        if (!slide || !card) return;

        if (cardSwapHandler) {
          card.removeEventListener('transitionend', cardSwapHandler);
        }

        window.clearTimeout(cardSwapTimer);
        card.classList.add('is-changing');

        function swap(event) {
          if (event && (event.target !== card || event.propertyName !== 'opacity')) return;
          card.removeEventListener('transitionend', cardSwapHandler);
          window.clearTimeout(cardSwapTimer);
          cardSwapHandler = null;

          if (numberEl) numberEl.textContent = slide.dataset.number || '01';
          if (textEl) textEl.textContent = slide.dataset.text || '';
          if (cardButton && slide.dataset.url) cardButton.setAttribute('href', slide.dataset.url);

          window.requestAnimationFrame(function () {
            card.classList.remove('is-changing');
          });
        }

        cardSwapHandler = swap;
        card.addEventListener('transitionend', cardSwapHandler);
        cardSwapTimer = window.setTimeout(swap, CARD_FADE_MS);
      }

      function clearZoomAnimations() {
        activeAnimations.forEach(function (animation) {
          try {
            animation.cancel();
          } catch (error) {}
        });
        activeAnimations = [];
      }

      function animateSlideZoom(currentIndex) {
        clearZoomAnimations();
        if (reduceMotion || !Element.prototype.animate) return;

        var currentInner = section.querySelector(
          '[data-veylique-arrivals-slide][data-index="' + currentIndex + '"] .veylique-slide-inner'
        );

        if (!currentInner) return;

        var animation = currentInner.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1.16)' },
            { transform: 'translate3d(0, 0, 0) scale(1)' }
          ],
          { duration: 1280, easing: 'cubic-bezier(0.19, 1, 0.22, 1)', fill: 'both' }
        );
        activeAnimations.push(animation);
      }

      function updateButtons() {
        var atStart = activeIndex <= 0;
        var atEnd = activeIndex >= slides.length - 1;

        controls.forEach(function (control) {
          var direction = control.dataset.direction;
          var disabled = direction === 'prev' ? atStart : atEnd;
          control.disabled = disabled;
          control.classList.toggle('is-disabled', disabled);
        });
      }

      function goToSlide(direction) {
        if (direction === 'prev' && activeIndex <= 0) return;
        if (direction === 'next' && activeIndex >= slides.length - 1) return;
        activeIndex += direction === 'next' ? 1 : -1;
        updateSlides();

        window.requestAnimationFrame(function () {
          animateSlideZoom(activeIndex);
          updateCard();
          updateButtons();

          if (lastMouseX >= 0) {
            var rect = stage.getBoundingClientRect();
            if (
              lastMouseX >= rect.left && lastMouseX <= rect.right &&
              lastMouseY >= rect.top && lastMouseY <= rect.bottom
            ) {
              moveCursor({ clientX: lastMouseX, clientY: lastMouseY, target: stage });
            }
          }
        });
      }

      function moveCursor(event) {
        if (!cursorArrow) return;
        if (isCursorBlocked || (event.target && event.target.closest('.veylique-card-button'))) {
          cursorArrow.classList.remove('is-visible', 'is-left', 'is-right');
          return;
        }

        var rect = stage.getBoundingClientRect();
        var isLeft = (event.clientX - rect.left) < rect.width / 2;
        var atStart = activeIndex <= 0;
        var atEnd = activeIndex >= slides.length - 1;

        if ((isLeft && atStart) || (!isLeft && atEnd)) {
          cursorArrow.classList.remove('is-visible', 'is-left', 'is-right');
          stage.classList.add('is-cursor-default');
          return;
        }

        cursorSide = isLeft ? 'left' : 'right';
        stage.classList.remove('is-cursor-default');
        cursorArrow.style.left = (event.clientX - rect.left) + 'px';
        cursorArrow.style.top = (event.clientY - rect.top) + 'px';
        cursorArrow.classList.add('is-visible');
        cursorArrow.classList.toggle('is-left', isLeft);
        cursorArrow.classList.toggle('is-right', !isLeft);
      }

      document.addEventListener('mousemove', function (event) {
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
      });

      window.addEventListener('scroll', function () {
        if (!cursorArrow || lastMouseX < 0) return;
        var rect = stage.getBoundingClientRect();

        if (
          lastMouseX >= rect.left && lastMouseX <= rect.right &&
          lastMouseY >= rect.top && lastMouseY <= rect.bottom
        ) {
          moveCursor({ clientX: lastMouseX, clientY: lastMouseY, target: stage });
        } else {
          cursorArrow.classList.remove('is-visible', 'is-left', 'is-right');
        }
      }, { passive: true });

      controls.forEach(function (control) {
        control.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          goToSlide(control.dataset.direction);
        });
      });

      stage.addEventListener('mousemove', moveCursor);
      stage.addEventListener('mouseleave', function () {
        if (cursorArrow) cursorArrow.classList.remove('is-visible', 'is-left', 'is-right');
        stage.classList.remove('is-cursor-default');
      });

      if (cardButton) {
        cardButton.addEventListener('mouseenter', function () {
          isCursorBlocked = true;
          if (cursorArrow) cursorArrow.classList.remove('is-visible', 'is-left', 'is-right');
        });
        cardButton.addEventListener('mouseleave', function () {
          isCursorBlocked = false;
        });
      }

      stage.addEventListener('click', function (event) {
        if (isSwiping) return;
        if (event.target.closest('.veylique-card-button, .veylique-mobile-arrows')) return;
        goToSlide(cursorSide === 'left' ? 'prev' : 'next');
      });

      stage.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        touchDeltaX = 0;
        isSwiping = false;
      }, { passive: true });

      stage.addEventListener('touchmove', function (event) {
        if (event.touches.length !== 1) return;
        touchDeltaX = event.touches[0].clientX - touchStartX;
        var deltaY = event.touches[0].clientY - touchStartY;
        if (!isSwiping && Math.abs(touchDeltaX) > 10 && Math.abs(touchDeltaX) > Math.abs(deltaY)) {
          isSwiping = true;
        }
      }, { passive: true });

      stage.addEventListener('touchend', function (event) {
        if (event.target.closest('.veylique-card-button, .veylique-mobile-arrows')) return;
        if (isSwiping && Math.abs(touchDeltaX) > SWIPE_THRESHOLD) {
          goToSlide(touchDeltaX < 0 ? 'next' : 'prev');
        }
        window.setTimeout(function () { isSwiping = false; }, 300);
      });

      updateSlides();
      updateCard();
      updateButtons();

      preloadImages().then(function () {
        window.requestAnimationFrame(function () {
          stage.classList.remove('is-loading');
        });
      });
    });
  }

  function initCardSliders(root) {
    root.querySelectorAll('[data-veylique-card-slider]').forEach(function (slider) {
      if (slider.dataset.veyliqueCardSliderReady === 'true') return;
      slider.dataset.veyliqueCardSliderReady = 'true';

      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var viewport = slider.querySelector('[data-veylique-card-slider-viewport]');
      var track = slider.querySelector('[data-veylique-card-slider-track]');
      var prev = slider.querySelector('[data-veylique-card-slider-prev]');
      var next = slider.querySelector('[data-veylique-card-slider-next]');
      if (!viewport || !track) return;

      var slides = [];
      var activeIndex = 0;
      var currentTranslate = 0;
      var targetTranslate = 0;
      var minTranslate = 0;
      var maxIndex = 0;
      var slideStep = 0;
      var frame = 0;
      var drag = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        startTranslate: 0,
        lastX: 0,
        lastTime: 0,
        velocity: 0,
        didDrag: false,
        suppressClickUntil: 0
      };

      function clampTranslate(value) {
        return Math.min(0, Math.max(minTranslate, value));
      }

      function setTranslate(value) {
        track.style.transform = 'translate3d(' + value + 'px, 0, 0)';
      }

      function easeOutCubic(progress) {
        return 1 - Math.pow(1 - progress, 3);
      }

      function translateToIndex(value) {
        if (!slideStep) return 0;
        return Math.min(maxIndex, Math.max(0, Math.round(Math.abs(clampTranslate(value)) / slideStep)));
      }

      function indexToTranslate(index) {
        return clampTranslate(-index * slideStep);
      }

      function updateNav() {
        var atStart = targetTranslate >= -1;
        var atEnd = targetTranslate <= minTranslate + 1 || activeIndex >= maxIndex;

        if (prev) {
          prev.disabled = atStart;
          prev.classList.toggle('swiper-button-disabled', atStart);
        }

        if (next) {
          next.disabled = atEnd;
          next.classList.toggle('swiper-button-disabled', atEnd);
        }
      }

      function stopAnimation() {
        if (!frame) return;
        window.cancelAnimationFrame(frame);
        frame = 0;
      }

      function animateTo(value, duration) {
        stopAnimation();
        targetTranslate = clampTranslate(value);

        if (reduceMotion || !duration) {
          currentTranslate = targetTranslate;
          activeIndex = translateToIndex(targetTranslate);
          setTranslate(currentTranslate);
          updateNav();
          return;
        }

        var from = currentTranslate;
        var to = targetTranslate;
        var start = performance.now();

        function tick(now) {
          var progress = Math.min(1, (now - start) / duration);
          currentTranslate = from + (to - from) * easeOutCubic(progress);
          setTranslate(currentTranslate);

          if (progress < 1) {
            frame = window.requestAnimationFrame(tick);
            return;
          }

          frame = 0;
          currentTranslate = to;
          activeIndex = translateToIndex(to);
          setTranslate(currentTranslate);
          updateNav();
        }

        frame = window.requestAnimationFrame(tick);
        updateNav();
      }

      function slideTo(index, duration) {
        activeIndex = Math.min(maxIndex, Math.max(0, index));
        animateTo(indexToTranslate(activeIndex), duration);
      }

      function measure() {
        slides = Array.prototype.slice.call(track.querySelectorAll('.swiper-slide'));
        if (!slides.length) {
          minTranslate = 0;
          maxIndex = 0;
          slideStep = 0;
          setTranslate(0);
          updateNav();
          return;
        }

        var styles = window.getComputedStyle(track);
        var gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
        var first = slides[0];
        var last = slides[slides.length - 1];
        var totalWidth = last.offsetLeft - first.offsetLeft + last.offsetWidth;

        slideStep = first.getBoundingClientRect().width + gap;
        minTranslate = Math.min(0, viewport.clientWidth - totalWidth);
        maxIndex = slideStep ? Math.ceil(Math.abs(minTranslate) / slideStep) : 0;
        activeIndex = Math.min(maxIndex, Math.max(0, activeIndex));
        currentTranslate = indexToTranslate(activeIndex);
        targetTranslate = currentTranslate;
        setTranslate(currentTranslate);
        updateNav();
      }

      function endDrag(event) {
        if (!drag.active) return;

        if (event && viewport.releasePointerCapture) {
          try {
            viewport.releasePointerCapture(drag.pointerId);
          } catch (error) {
            // Pointer may already be released by the browser.
          }
        }

        viewport.classList.remove('is-pointer-down', 'is-dragging');

        if (drag.didDrag) {
          drag.suppressClickUntil = Date.now() + 320;
          slideTo(translateToIndex(currentTranslate + Math.max(-2.4, Math.min(2.4, drag.velocity)) * 420), 680);
        } else {
          animateTo(targetTranslate, 260);
        }

        drag.active = false;
        drag.pointerId = null;
      }

      viewport.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || !event.isPrimary || !maxIndex) return;
        stopAnimation();
        drag.active = true;
        drag.pointerId = event.pointerId;
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        drag.startTranslate = currentTranslate;
        drag.lastX = event.clientX;
        drag.lastTime = performance.now();
        drag.velocity = 0;
        drag.didDrag = false;
        viewport.classList.add('is-pointer-down');
        if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
      });

      viewport.addEventListener('pointermove', function (event) {
        if (!drag.active || event.pointerId !== drag.pointerId) return;

        var deltaX = event.clientX - drag.startX;
        var deltaY = event.clientY - drag.startY;
        var horizontal = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 4;
        if (!drag.didDrag && !horizontal) return;

        drag.didDrag = true;
        viewport.classList.add('is-dragging');
        event.preventDefault();

        var nextTranslate = drag.startTranslate + deltaX;
        if (nextTranslate > 0) nextTranslate *= 0.28;
        else if (nextTranslate < minTranslate) nextTranslate = minTranslate + (nextTranslate - minTranslate) * 0.28;

        currentTranslate = nextTranslate;
        targetTranslate = clampTranslate(nextTranslate);
        setTranslate(currentTranslate);

        var now = performance.now();
        var elapsed = now - drag.lastTime;
        if (elapsed > 0) {
          drag.velocity = (event.clientX - drag.lastX) / elapsed;
          drag.lastX = event.clientX;
          drag.lastTime = now;
        }
      });

      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', endDrag);
      viewport.addEventListener('lostpointercapture', endDrag);
      viewport.addEventListener('click', function (event) {
        if (Date.now() > drag.suppressClickUntil) return;
        event.preventDefault();
        event.stopPropagation();
      }, true);

      if (prev) {
        prev.addEventListener('click', function () {
          slideTo(activeIndex - 1, 680);
        });
      }

      if (next) {
        next.addEventListener('click', function () {
          slideTo(activeIndex + 1, 680);
        });
      }

      viewport.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        slideTo(activeIndex + (event.key === 'ArrowRight' ? 1 : -1), 680);
      });

      var resizeFrame = 0;
      window.addEventListener('resize', function () {
        if (resizeFrame) return;
        resizeFrame = window.requestAnimationFrame(function () {
          resizeFrame = 0;
          measure();
        });
      });

      measure();
    });
  }

  function initOccasions(root) {
    root.querySelectorAll('[data-veylique-occasion]').forEach(function (section) {
      if (section.dataset.veyliqueOccasionReady === 'true') return;
      section.dataset.veyliqueOccasionReady = 'true';

      var items = Array.prototype.slice.call(section.querySelectorAll('[data-occ-item]'));
      var slides = Array.prototype.slice.call(section.querySelectorAll('[data-occ-slide]'));
      if (!items.length || !slides.length) return;

      function activate(index) {
        items.forEach(function (item, itemIndex) {
          var active = itemIndex === index;
          item.classList.toggle('is-active', active);
          var tab = item.querySelector('[data-occ-tab]');
          if (tab) tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        slides.forEach(function (slide, slideIndex) {
          slide.classList.toggle('is-active', slideIndex === index);
        });
      }

      items.forEach(function (item, index) {
        var tab = item.querySelector('[data-occ-tab]');
        if (!tab) return;
        tab.addEventListener('click', function () {
          activate(index);
        });
      });
    });
  }

  function initTestimonials(root) {
    root.querySelectorAll('[data-veylique-testi]').forEach(function (section) {
      if (section.dataset.veyliqueTestiReady === 'true') return;
      section.dataset.veyliqueTestiReady = 'true';

      var persons = Array.prototype.slice.call(section.querySelectorAll('.veylique-testi-person'));
      var bubbles = Array.prototype.slice.call(section.querySelectorAll('.veylique-testi-bubble'));
      var dots = Array.prototype.slice.call(section.querySelectorAll('.veylique-testi-dot'));
      if (persons.length < 2) return;

      var current = 0;
      var timer = 0;
      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function show(index) {
        current = (index + persons.length) % persons.length;
        persons.forEach(function (person, personIndex) {
          person.classList.toggle('is-active', personIndex === current);
        });
        bubbles.forEach(function (bubble) {
          bubble.classList.toggle('is-active', Number(bubble.dataset.testiTarget) === current);
        });
        dots.forEach(function (dot) {
          dot.classList.toggle('is-active', Number(dot.dataset.testiTarget) === current);
        });
      }

      function start() {
        if (reduceMotion) return;
        window.clearInterval(timer);
        timer = window.setInterval(function () {
          show(current + 1);
        }, 5000);
      }

      function stop() {
        window.clearInterval(timer);
      }

      bubbles.concat(dots).forEach(function (control) {
        control.addEventListener('click', function () {
          show(Number(control.dataset.testiTarget) || 0);
          start();
        });
      });

      section.addEventListener('mouseenter', stop);
      section.addEventListener('mouseleave', start);
      section.addEventListener('focusin', stop);
      section.addEventListener('focusout', start);

      start();
    });
  }

  function initRituals(root) {
    root.querySelectorAll('[data-veylique-ritual]').forEach(function (section) {
      if (section.dataset.veyliqueRitualReady === 'true') return;
      section.dataset.veyliqueRitualReady = 'true';

      var cards = Array.prototype.slice.call(section.querySelectorAll('.veylique-ritual-card'));
      var dots = Array.prototype.slice.call(section.querySelectorAll('.veylique-ritual-dot'));
      var label = section.querySelector('[data-veylique-ritual-label]');
      if (!cards.length) return;

      function setActive(index, progressInStep) {
        cards.forEach(function (card, cardIndex) {
          card.classList.toggle('is-base', cardIndex === index);
        });

        dots.forEach(function (dot, dotIndex) {
          var bar = dot.querySelector('span');
          dot.classList.toggle('is-current', dotIndex === index);
          if (!bar) return;
          if (dotIndex < index) bar.style.transform = 'scaleX(1)';
          else if (dotIndex === index) bar.style.transform = 'scaleX(' + progressInStep + ')';
          else bar.style.transform = 'scaleX(0)';
        });

        if (label) {
          var title = cards[index].dataset.title || '';
          var step = String(index + 1).padStart(2, '0');
          var total = String(cards.length).padStart(2, '0');
          label.textContent = title + ' - ' + step + ' / ' + total;
        }
      }

      function update() {
        if (window.matchMedia('(max-width: 991px)').matches) return;

        var rect = section.getBoundingClientRect();
        var scrollable = Math.max(1, rect.height - window.innerHeight);
        var progress = Math.min(1, Math.max(0, -rect.top / scrollable));
        var exact = progress * cards.length;
        var index = Math.min(cards.length - 1, Math.max(0, Math.floor(exact)));
        var progressInStep = Math.min(1, Math.max(0.08, exact - index));

        if (progress >= 1) progressInStep = 1;
        setActive(index, progressInStep);
      }

      var ticking = false;
      function requestUpdate() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          ticking = false;
          update();
        });
      }

      window.addEventListener('scroll', requestUpdate, { passive: true });
      window.addEventListener('resize', requestUpdate);
      update();
    });
  }

  function initHomeFaqs(root) {
    root.querySelectorAll('[data-veylique-home-faq]').forEach(function (section) {
      if (section.dataset.veyliqueHomeFaqReady === 'true') return;
      section.dataset.veyliqueHomeFaqReady = 'true';

      var items = Array.prototype.slice.call(section.querySelectorAll('.veylique-home-faq-item'));
      if (!items.length) return;

      function setItem(item, open) {
        item.classList.toggle('is-open', open);
        var button = item.querySelector('.veylique-home-faq-question');
        if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      items.forEach(function (item) {
        setItem(item, item.classList.contains('is-open'));
        var button = item.querySelector('.veylique-home-faq-question');
        if (!button) return;

        button.addEventListener('click', function () {
          var shouldOpen = !item.classList.contains('is-open');
          items.forEach(function (otherItem) {
            setItem(otherItem, otherItem === item ? shouldOpen : false);
          });
        });
      });
    });
  }

  function initBlogs(root) {
    root.querySelectorAll('[data-veylique-blog]').forEach(function (section) {
      if (section.dataset.veyliqueBlogReady === 'true') return;
      section.dataset.veyliqueBlogReady = 'true';

      var rows = Array.prototype.slice.call(section.querySelectorAll('.veylique-blog-scroll-row'));
      var panels = Array.prototype.slice.call(section.querySelectorAll('.veylique-blog-panel'));
      if (rows.length < 2 || panels.length < 2) return;

      function setActive(index) {
        rows.forEach(function (row, rowIndex) {
          row.classList.toggle('is-active', rowIndex === index);
        });
        panels.forEach(function (panel, panelIndex) {
          panel.classList.toggle('is-active', panelIndex === index);
        });
      }

      function updateActiveByPosition() {
        var viewportCenter = window.innerHeight / 2;
        var closestIndex = 0;
        var closestDistance = Infinity;

        rows.forEach(function (row, index) {
          var rect = row.getBoundingClientRect();
          var distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        });

        setActive(closestIndex);
      }

      var ticking = false;
      function requestUpdate() {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          ticking = false;
          updateActiveByPosition();
        });
      }

      if (window.matchMedia('(min-width: 992px)').matches) {
        window.addEventListener('scroll', requestUpdate, { passive: true });
        window.addEventListener('resize', requestUpdate);
        requestUpdate();
      }

      rows.forEach(function (row, index) {
        row.addEventListener('click', function (event) {
          if (row.getAttribute('href') === '/') event.preventDefault();
          setActive(index);
        });
        row.addEventListener('mouseenter', function () {
          setActive(index);
        });
      });
    });
  }

  function init() {
    initFaq(document);
    initHeroes(document);
    initHeader(document);
    initFooter(document);
    initCategoryCarousels(document);
    initReveals(document);
    initProductCards(document);
    initArrivals(document);
    initCardSliders(document);
    initOccasions(document);
    initTestimonials(document);
    initRituals(document);
    initHomeFaqs(document);
    initBlogs(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (event) {
    initFaq(event.target);
    initHeroes(event.target);
    initHeader(event.target);
    initFooter(event.target);
    initCategoryCarousels(event.target);
    initReveals(event.target);
    initProductCards(event.target);
    initArrivals(event.target);
    initCardSliders(event.target);
    initOccasions(event.target);
    initTestimonials(event.target);
    initRituals(event.target);
    initHomeFaqs(event.target);
    initBlogs(event.target);
  });
})();
