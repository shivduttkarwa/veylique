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

      var scroller = carousel.querySelector('[data-veylique-cat-track]');
      var prev = carousel.querySelector('[data-veylique-cat-prev]');
      var next = carousel.querySelector('[data-veylique-cat-next]');

      carousel.querySelectorAll('[data-veylique-hover-image]').forEach(function (image) {
        function markLoaded() {
          image.classList.add('is-loaded');
        }

        if (image.complete && image.naturalWidth) markLoaded();
        else image.addEventListener('load', markLoaded, { once: true });
      });

      if (!scroller || typeof Swiper === 'undefined') return;

      new Swiper(scroller, {
        slidesPerView: 1.4,
        spaceBetween: 16,
        speed: 600,
        grabCursor: true,
        watchOverflow: true,
        threshold: 4,
        resistanceRatio: 0.72,
        a11y: { enabled: true },
        keyboard: { enabled: true, onlyInViewport: true },
        navigation: {
          prevEl: prev,
          nextEl: next,
          disabledClass: 'swiper-button-disabled'
        },
        breakpoints: {
          600: { slidesPerView: 2.2, spaceBetween: 18 },
          1024: { slidesPerView: 4, spaceBetween: 24 }
        }
      });
    });
  }

  /* Section-intro reveal (ported from the static demo). Splits the section
     title into lines with SplitText, masks each line, and slides them up on
     scroll while the eyebrow blur-fades in and the description fades. Intros
     that already ship a pre-wrapped .veylique-si-mask (e.g. the category
     carousel) drive their own reveal and are skipped here. */
  function initSectionIntroReveal(root) {
    var hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
    var hasSplit = typeof SplitText !== 'undefined';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    root.querySelectorAll('.veylique-section-intro-js').forEach(function (intro) {
      if (intro.dataset.veyliqueIntroReady === 'true') return;
      intro.dataset.veyliqueIntroReady = 'true';

      if (intro.querySelector('.veylique-si-mask')) return;

      var eyebrow = intro.querySelector('.veylique-eyebrow');
      var title = intro.querySelector('.veylique-section-title');
      var desc = intro.querySelector('.veylique-section-desc');
      if (!title) return;

      if (!hasGsap || reduce) {
        if (eyebrow) { eyebrow.style.visibility = 'visible'; eyebrow.style.opacity = '1'; }
        if (desc) { desc.style.visibility = 'visible'; desc.style.opacity = '1'; }
        return;
      }

      gsap.registerPlugin(ScrollTrigger);
      if (hasSplit) gsap.registerPlugin(SplitText);

      var titleTargets;
      if (hasSplit) {
        var split = new SplitText(title, { type: 'lines', linesClass: 'veylique-si-line' });
        split.lines.forEach(function (line) {
          var mask = document.createElement('div');
          mask.className = 'veylique-si-mask';
          line.parentNode.insertBefore(mask, line);
          mask.appendChild(line);
        });
        titleTargets = split.lines;
      } else {
        var singleMask = document.createElement('div');
        singleMask.className = 'veylique-si-mask';
        title.parentNode.insertBefore(singleMask, title);
        singleMask.appendChild(title);
        titleTargets = [title];
      }

      gsap.set(titleTargets, { yPercent: 110 });
      if (eyebrow) gsap.set(eyebrow, { autoAlpha: 0, y: 8, filter: 'blur(5px)' });
      if (desc) gsap.set(desc, { autoAlpha: 0 });

      var tl = gsap.timeline({
        scrollTrigger: { trigger: intro, start: 'top 65%', once: true },
        defaults: { ease: 'power4.out' }
      });

      if (eyebrow) {
        tl.to(eyebrow, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.85, ease: 'power3.out' }, 0);
      }

      var titlePos = eyebrow ? 0.18 : 0;
      tl.to(titleTargets, { yPercent: 0, duration: 1.05, stagger: hasSplit ? 0.12 : 0 }, titlePos);

      if (desc) {
        tl.to(desc, { autoAlpha: 1, duration: 0.7, ease: 'power2.out' }, '-=0.55');
      }
    });
  }

  /* Batch reveal engine (ported from the static demo). Reveals .veylique-reveal-js
     elements on scroll with per-type animation — static (fade), fade (rise+fade),
     right/left (slide), text (SplitText line/char stagger), clip (clip-path wipe)
     — staggered across each scroll batch. */
  function initReveals(root) {
    var hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
    var hasSplit = typeof SplitText !== 'undefined';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var targets = Array.prototype.slice.call(root.querySelectorAll('.veylique-reveal-js'))
      .filter(function (el) {
        return el.dataset.veyliqueRevealReady !== 'true' && !el.classList.contains('veylique-reveal--hero-js');
      });
    if (!targets.length) return;
    targets.forEach(function (el) { el.dataset.veyliqueRevealReady = 'true'; });

    if (!hasGsap || reduce) {
      targets.forEach(function (el) {
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.classList.add('veylique-clip-done');
      });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    if (hasSplit) gsap.registerPlugin(SplitText);

    if (hasSplit) {
      targets.forEach(function (el) {
        if (!el.classList.contains('veylique-split-js') || el.dataset.veyliqueSplitDone === 'true') return;
        el.dataset.veyliqueSplitDone = 'true';
        if (el.classList.contains('veylique-split--chars-js')) {
          new SplitText(el, { type: 'chars,lines', linesClass: 'veylique-st-line', charsClass: 'veylique-st-char', aria: 'none' });
        } else {
          new SplitText(el, { type: 'lines', linesClass: 'veylique-st-line', aria: 'none' });
        }
      });
    }

    var _fade = [], _static = [], _right = [], _left = [], _lines = [], _chars = [];
    targets.forEach(function (el) {
      if (el.classList.contains('veylique-reveal--fade-js')) _fade.push(el);
      if (el.classList.contains('veylique-reveal--static-js')) _static.push(el);
      if (el.classList.contains('veylique-reveal--right-js')) _right.push(el);
      if (el.classList.contains('veylique-reveal--left-js')) _left.push(el);
      if (el.classList.contains('veylique-reveal--text-js')) {
        if (el.classList.contains('veylique-split--chars-js')) {
          _chars = _chars.concat(Array.prototype.slice.call(el.querySelectorAll('.veylique-st-char')));
        } else {
          _lines = _lines.concat(Array.prototype.slice.call(el.querySelectorAll('.veylique-st-line')));
        }
      }
    });

    if (_fade.length) gsap.set(_fade, { y: 30, autoAlpha: 0 });
    if (_static.length) gsap.set(_static, { autoAlpha: 0 });
    if (_right.length) gsap.set(_right, { x: '15%', autoAlpha: 0 });
    if (_left.length) gsap.set(_left, { x: '-15%', autoAlpha: 0 });
    if (_lines.length) gsap.set(_lines, { y: 30, autoAlpha: 0 });
    if (_chars.length) gsap.set(_chars, { autoAlpha: 0 });

    function animateDef(el, index, isStatic) {
      var ease = 'power1.out';
      var delay = index * 0.1 + (parseFloat(el.dataset.veyliqueDelay) || 0);
      if (!isStatic) gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: ease, delay: delay });
      gsap.to(el, { autoAlpha: 1, duration: 0.5, ease: ease, delay: delay + 0.1 });
    }

    function animateBatch(batch) {
      batch.forEach(function (el, index) {
        if (el.classList.contains('veylique-reveal--clip-js')) {
          gsap.fromTo(el, { '--mustard-clip': '100%' }, {
            '--mustard-clip': '0%', duration: 1.1, ease: 'power3.out', delay: index * 0.2,
            onComplete: function () { el.classList.add('veylique-clip-done'); }
          });
          return;
        }

        if (el.classList.contains('veylique-reveal--text-js')) {
          var chars = el.querySelectorAll('.veylique-st-char');
          var lines = el.querySelectorAll('.veylique-st-line');
          var d = index * 0.1;
          if (chars.length) {
            gsap.to(chars, { autoAlpha: 1, duration: 0.4, ease: 'power3.inOut', stagger: 0.05, delay: d });
          } else if (lines.length) {
            gsap.to(lines, { y: 0, duration: 0.6, ease: 'power1.out', stagger: 0.15, delay: d });
            gsap.to(lines, { autoAlpha: 1, duration: 0.5, ease: 'power1.out', stagger: 0.15, delay: d + 0.1 });
          } else {
            animateDef(el, index, false);
          }
          return;
        }

        if (el.classList.contains('veylique-reveal--static-js')) {
          animateDef(el, index, true);
          return;
        }

        animateDef(el, index, false);
      });
    }

    ScrollTrigger.batch(targets, {
      start: 'top bottom-=50',
      once: true,
      onEnter: animateBatch
    });
  }

  function initProductCards(root) {
    root.querySelectorAll('.veylique-best-img--hover, .veylique-lp-img--hover, .veylique-pcard__img--hover').forEach(function (image) {
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

  /* Bestsellers + Latest Products: shared Swiper product carousel. Same clean,
     swipe-first behavior as New Arrivals; nav arrows drive desktop, swipe drives
     touch. Markup already carries the .swiper/.swiper-wrapper/.swiper-slide
     structure, so this just wires Swiper to the existing hooks. */
  function initCardSliders(root) {
    if (typeof Swiper === 'undefined') return;

    root.querySelectorAll('[data-veylique-card-slider]').forEach(function (slider) {
      if (slider.dataset.veyliqueCardSliderReady === 'true') return;

      var viewport = slider.querySelector('[data-veylique-card-slider-viewport]');
      if (!viewport) return;
      slider.dataset.veyliqueCardSliderReady = 'true';

      var prev = slider.querySelector('[data-veylique-card-slider-prev]');
      var next = slider.querySelector('[data-veylique-card-slider-next]');

      new Swiper(viewport, {
        slidesPerView: 1.3,
        spaceBetween: 16,
        speed: 600,
        grabCursor: true,
        watchOverflow: true,
        threshold: 4,
        resistanceRatio: 0.72,
        a11y: { enabled: true },
        keyboard: { enabled: true, onlyInViewport: true },
        navigation: {
          prevEl: prev,
          nextEl: next,
          disabledClass: 'swiper-button-disabled'
        },
        breakpoints: {
          560: { slidesPerView: 2.2, spaceBetween: 18 },
          900: { slidesPerView: 3, spaceBetween: 20 },
          1200: { slidesPerView: 4, spaceBetween: 24 }
        }
      });
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

  /* ===== Style ritual: scroll-driven WebGL peel deck ==============
     The resting card is always the crisp DOM element; the peel shader only
     distorts an offscreen rasterization of a card mid-transition. Falls back
     to a DOM flight when WebGL / a texture isn't available, and to a static
     first card under reduced motion. ============================== */

  function ritualClamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function ritualSmooth(value) {
    return value * value * (3 - 2 * value);
  }

  function ritualCoverDraw(ctx, img, dx, dy, dw, dh) {
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    if (!iw || !ih) return;
    var scale = Math.max(dw / iw, dh / ih);
    var sw = dw / scale;
    var sh = dh / scale;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh);
  }

  function ritualDrawTextEl(ctx, el, cardRect, options) {
    if (!el) return;
    options = options || {};

    var cs = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var x = rect.left - cardRect.left;
    var y = rect.top - cardRect.top;
    var text = el.textContent.replace(/\s+/g, ' ').trim();

    if (!text) return;
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();

    var fontSize = parseFloat(cs.fontSize);
    var lineHeight = parseFloat(cs.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = fontSize * 1.2;

    var padLeft = parseFloat(cs.paddingLeft) || 0;
    var padRight = parseFloat(cs.paddingRight) || 0;
    var padTop = parseFloat(cs.paddingTop) || 0;
    x += padLeft;
    y += padTop;

    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fontSize + 'px ' + cs.fontFamily;
    if ('letterSpacing' in ctx && cs.letterSpacing !== 'normal') {
      ctx.letterSpacing = cs.letterSpacing;
    }
    ctx.textBaseline = 'alphabetic';

    var maxWidth = Math.max(10, el.clientWidth - padLeft - padRight);
    var words = text.split(' ');
    var lines = [];
    var line = '';

    words.forEach(function (word) {
      var probe = line ? line + ' ' + word : word;
      if (line && ctx.measureText(probe).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = probe;
      }
    });
    if (line) lines.push(line);

    lines.forEach(function (ln, i) {
      var metrics = ctx.measureText(ln);
      var ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
      var descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
      var hasMetrics = typeof ascent === 'number' && typeof descent === 'number' && isFinite(ascent) && isFinite(descent) && ascent + descent > 0;
      var baseline;

      if (hasMetrics) {
        baseline = y + i * lineHeight + (lineHeight - ascent - descent) / 2 + ascent;
      } else {
        baseline = y + i * lineHeight + (lineHeight + fontSize * 0.72) / 2 - fontSize * 0.08;
      }

      if (options.stroke) {
        ctx.strokeStyle = cs.webkitTextStrokeColor || cs.color;
        ctx.lineWidth = Math.max(1, parseFloat(cs.webkitTextStrokeWidth) || 1);
        ctx.strokeText(ln, x, baseline);
      } else {
        ctx.fillStyle = cs.color;
        ctx.fillText(ln, x, baseline);
      }
    });

    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = '0px';
    }
  }

  function ritualDrawRuleEl(ctx, el, cardRect) {
    if (!el) return;
    var cs = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    ctx.fillStyle = cs.backgroundColor;
    ctx.fillRect(rect.left - cardRect.left, rect.top - cardRect.top, rect.width, rect.height);
  }

  function ritualDrawBoxEl(ctx, el, cardRect) {
    if (!el) return;
    var cs = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    var x = rect.left - cardRect.left;
    var y = rect.top - cardRect.top;
    var radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, rect.height / 2);

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, rect.width, rect.height, radius);
    } else {
      ctx.rect(x, y, rect.width, rect.height);
    }

    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = cs.backgroundColor;
      ctx.fill();
    }

    var borderWidth = parseFloat(cs.borderTopWidth) || 0;
    if (borderWidth > 0) {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
    }
  }

  var ritualPeelVertexSource = [
    'attribute vec2 aPos;',
    'uniform vec4 uFrom;',
    'uniform vec4 uTo;',
    'uniform float uShow;',
    'uniform vec2 uViewport;',
    'varying vec2 vUv;',
    'varying vec2 vRectWH;',
    'void main(){',
    'vec2 p=aPos;',
    'float downBias=pow(1.0-p.y,1.35)*0.42;',
    'float cornerBias=(pow(p.x*p.x,0.78)+pow(1.0-p.y,1.6))*0.35;',
    'float pw=1.0-downBias-cornerBias;',
    'float sr=smoothstep(pw*0.42,0.54+pw*0.42,uShow);',
    'vec4 rect=mix(uFrom,uTo,sr);',
    'rect.x+=mix(rect.z,0.0,cos(sr*6.2831853)*0.5+0.5)*0.055;',
    'rect.y+=(1.0-sr)*(1.0-p.y)*18.0;',
    'vec2 sp=rect.xy+p*rect.zw;',
    'float rot=(smoothstep(0.0,1.0,sr)-sr)*-1.08;',
    'vec2 ctr=rect.xy+rect.zw*0.5;',
    'vec2 rel=sp-ctr;',
    'float s=sin(rot);',
    'float c=cos(rot);',
    'rel=mat2(c,-s,s,c)*rel;',
    'sp=ctr+rel;',
    'vec2 clip=(sp/uViewport)*2.0-1.0;',
    'gl_Position=vec4(clip.x,-clip.y,0.0,1.0);',
    'vUv=p;',
    'vRectWH=rect.zw;',
    '}'
  ].join('');

  var ritualPeelFragmentSource = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform float uImageAspect;',
    'uniform float uR0;',
    'uniform float uR1;',
    'uniform float uShow;',
    'varying vec2 vUv;',
    'varying vec2 vRectWH;',
    'void main(){',
    'float planeAspect=vRectWH.x/max(vRectWH.y,1.0);',
    'vec2 s=planeAspect>uImageAspect?vec2(1.0,uImageAspect/planeAspect):vec2(planeAspect/uImageAspect,1.0);',
    'vec2 uv=(vUv-0.5)*s+0.5;',
    'vec3 col=texture2D(uTex,uv).rgb;',
    'vec2 p=vUv*vRectWH;',
    'vec2 halfRes=vRectWH*0.5;',
    'float r=min(mix(uR0,uR1,uShow),min(halfRes.x,halfRes.y));',
    'vec2 q=abs(p-halfRes)-(halfRes-vec2(r));',
    'float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;',
    'float a=1.0-smoothstep(-1.0,1.0,d);',
    'gl_FragColor=vec4(col*a,a);',
    '}'
  ].join('');

  function ritualCreatePeelMedia(canvas, count) {
    var gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true
    });

    if (!gl) return null;

    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    var vertex = compile(gl.VERTEX_SHADER, ritualPeelVertexSource);
    var fragment = compile(gl.FRAGMENT_SHADER, ritualPeelFragmentSource);
    if (!vertex || !fragment) return null;

    var program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    gl.useProgram(program);

    var segmentX = 128;
    var segmentY = 80;
    var vertices = [];
    var indices = [];

    for (var iy = 0; iy <= segmentY; iy++) {
      for (var ix = 0; ix <= segmentX; ix++) {
        vertices.push(ix / segmentX, iy / segmentY);
      }
    }

    for (iy = 0; iy < segmentY; iy++) {
      for (ix = 0; ix < segmentX; ix++) {
        var a = iy * (segmentX + 1) + ix;
        var b = a + 1;
        var c = a + segmentX + 1;
        var d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    var indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    var position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    var uniforms = {
      from: gl.getUniformLocation(program, 'uFrom'),
      to: gl.getUniformLocation(program, 'uTo'),
      show: gl.getUniformLocation(program, 'uShow'),
      viewport: gl.getUniformLocation(program, 'uViewport'),
      imageAspect: gl.getUniformLocation(program, 'uImageAspect'),
      r0: gl.getUniformLocation(program, 'uR0'),
      r1: gl.getUniformLocation(program, 'uR1')
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var textures = [];
    for (var i = 0; i < count; i++) {
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      textures.push({ texture: texture, aspect: 16 / 9, ready: false });
    }

    function upload(index, sourceCanvas) {
      var record = textures[index];
      if (!record || !sourceCanvas) return;
      try {
        record.aspect = sourceCanvas.width / Math.max(1, sourceCanvas.height);
        gl.bindTexture(gl.TEXTURE_2D, record.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        record.ready = true;
      } catch (e) {
        record.ready = false;
      }
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    function resize() {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function clear() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    function draw(config) {
      var record = textures[config.imageIndex];
      clear();
      if (!record || !record.ready) return false;

      gl.useProgram(program);
      gl.bindTexture(gl.TEXTURE_2D, record.texture);
      gl.uniform4f(uniforms.from, config.from.x, config.from.y, Math.max(1, config.from.w), Math.max(1, config.from.h));
      gl.uniform4f(uniforms.to, config.to.x, config.to.y, Math.max(1, config.to.w), Math.max(1, config.to.h));
      gl.uniform1f(uniforms.show, config.show);
      gl.uniform2f(uniforms.viewport, window.innerWidth, window.innerHeight);
      gl.uniform1f(uniforms.imageAspect, record.aspect);
      gl.uniform1f(uniforms.r0, Math.max(0, config.r0));
      gl.uniform1f(uniforms.r1, Math.max(0, config.r1));
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      return true;
    }

    resize();
    window.addEventListener('resize', resize);

    return {
      draw: draw,
      clear: clear,
      upload: upload,
      isReady: function (index) {
        return !!(textures[index] && textures[index].ready);
      }
    };
  }

  function initRituals(root) {
    root.querySelectorAll('[data-veylique-ritual]').forEach(function (section) {
      if (section.dataset.veyliqueRitualReady === 'true') return;
      section.dataset.veyliqueRitualReady = 'true';

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        section.classList.add('is-ritual-static');
        return;
      }

      var stage = section.querySelector('.veylique-ritual-stage');
      var cards = Array.prototype.slice.call(section.querySelectorAll('.veylique-ritual-card'));
      var dots = section.querySelector('.veylique-ritual-progress-dots');
      var slideLabel = section.querySelector('[data-veylique-ritual-label]');

      if (!window.matchMedia('(min-width: 992px)').matches || !stage || cards.length < 2) return;

      var hasGsap = typeof gsap !== 'undefined';
      var hasScrollTrigger = hasGsap && typeof ScrollTrigger !== 'undefined';
      if (hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);

      /* Rasterize a whole card (surface + image + text) into an offscreen
         canvas from its real computed styles and geometry — the texture is
         only ever seen mid-flight and distorted. */
      function renderCardToCanvas(card) {
        var cardRect = card.getBoundingClientRect();
        if (cardRect.width < 10 || cardRect.height < 10) return null;

        var scale = Math.min(window.devicePixelRatio || 1, 2);
        var snapshot = document.createElement('canvas');
        snapshot.width = Math.round(cardRect.width * scale);
        snapshot.height = Math.round(cardRect.height * scale);

        var ctx = snapshot.getContext('2d');
        if (!ctx) return null;
        ctx.scale(scale, scale);

        var cardStyle = window.getComputedStyle(card);
        ctx.fillStyle = cardStyle.backgroundColor && cardStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cardStyle.backgroundColor : '#ffffff';
        ctx.fillRect(0, 0, cardRect.width, cardRect.height);

        var body = card.querySelector('.veylique-ritual-card-body');
        if (body) {
          var bodyRect = body.getBoundingClientRect();
          var bx = bodyRect.left - cardRect.left;
          var by = bodyRect.top - cardRect.top;
          var gradient = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(bodyRect.width * 1.2, bodyRect.height * 0.8));
          gradient.addColorStop(0, 'rgba(166, 94, 85, 0.06)');
          gradient.addColorStop(0.55, 'rgba(166, 94, 85, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(bx, by, bodyRect.width, bodyRect.height);
        }

        var mediaEl = card.querySelector('.veylique-ritual-card-media');
        var img = mediaEl ? mediaEl.querySelector('img') : null;
        if (img && img.complete && img.naturalWidth) {
          var mediaRect = mediaEl.getBoundingClientRect();
          ritualCoverDraw(ctx, img, mediaRect.left - cardRect.left, mediaRect.top - cardRect.top, mediaRect.width, mediaRect.height);
        }

        var kicker = card.querySelector('.veylique-ritual-card-kicker');
        ritualDrawTextEl(ctx, card.querySelector('.veylique-ritual-card-num'), cardRect);
        ritualDrawBoxEl(ctx, kicker, cardRect);
        ritualDrawTextEl(ctx, kicker, cardRect);
        ritualDrawTextEl(ctx, card.querySelector('.veylique-ritual-card-title-main'), cardRect);
        ritualDrawTextEl(ctx, card.querySelector('.veylique-ritual-card-title-alt'), cardRect);
        ritualDrawRuleEl(ctx, card.querySelector('.veylique-ritual-card-rule'), cardRect);
        ritualDrawTextEl(ctx, card.querySelector('.veylique-ritual-card-text'), cardRect);

        return snapshot;
      }

      // Reduced-motion static state can leave a canvas behind on editor re-render.
      Array.prototype.slice.call(document.querySelectorAll('.veylique-ritual-peel-canvas')).forEach(function (existing) {
        if (existing.ritualSection && !document.contains(existing.ritualSection)) existing.remove();
      });

      var canvas = document.createElement('canvas');
      canvas.className = 'veylique-ritual-peel-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.ritualSection = section;
      document.body.appendChild(canvas);

      var peel = window.WebGLRenderingContext ? ritualCreatePeelMedia(canvas, cards.length) : null;

      var rebuildTimer = null;

      function buildTextures() {
        if (!peel) return;
        cards.forEach(function (card, index) {
          var snapshot = renderCardToCanvas(card);
          if (snapshot) peel.upload(index, snapshot);
        });
      }

      function queueBuildTextures() {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(buildTextures, 180);
      }

      if (peel) {
        var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        fontsReady.then(queueBuildTextures);

        cards.forEach(function (card) {
          var img = card.querySelector('.veylique-ritual-card-media img');
          if (img && !img.complete) img.addEventListener('load', queueBuildTextures);
        });

        window.addEventListener('resize', queueBuildTextures);
        queueBuildTextures();
      }

      // Pre-decode each card image so the DOM card is paint-ready when it docks.
      cards.forEach(function (card) {
        var img = card.querySelector('.veylique-ritual-card-media img');
        if (img && typeof img.decode === 'function') img.decode().catch(function () {});
      });

      /* One-time entrance on the first card: mosaic-tile dissolve + image
         un-blur + content stagger. GSAP-gated; the peel runs regardless. */
      function initRitualEntrance() {
        if (!hasGsap || !hasScrollTrigger) return;

        var desktop = section.querySelector('.veylique-ritual-desktop');
        var progressRow = section.querySelector('.veylique-ritual-progress-row');
        var baseCard = cards[0];
        if (!desktop || !baseCard) return;

        var media = baseCard.querySelector('.veylique-ritual-card-media');
        var mediaImg = media ? media.querySelector('img') : null;
        var body = baseCard.querySelector('.veylique-ritual-card-body');
        var contentEls = body ? Array.prototype.slice.call(body.children) : [];
        var mosaic = null;
        var tiles = [];
        var entranceTrigger = null;
        var entrancePlayed = false;

        if (progressRow) contentEls.push(progressRow);

        if (media) {
          media.style.overflow = 'hidden';
          mosaic = document.createElement('div');
          mosaic.className = 'veylique-mosaic-grid';
          for (var i = 0; i < 24; i++) {
            var tile = document.createElement('span');
            tile.className = 'veylique-mosaic-tile';
            mosaic.appendChild(tile);
          }
          media.appendChild(mosaic);
          tiles = Array.prototype.slice.call(mosaic.querySelectorAll('.veylique-mosaic-tile'));
        }

        if (mediaImg) {
          gsap.set(mediaImg, { scale: 1.18, filter: 'blur(8px)', transformOrigin: 'top right' });
        }

        if (contentEls.length) {
          gsap.set(contentEls, { autoAlpha: 0, y: 24 });
        }

        function playEntrance() {
          if (entrancePlayed) return;
          entrancePlayed = true;
          if (entranceTrigger) entranceTrigger.kill(false);

          if (tiles.length) {
            gsap.to(tiles, {
              opacity: 0,
              scale: 0.4,
              rotate: function () { return gsap.utils.random(-18, 18); },
              yPercent: function () { return gsap.utils.random(-80, 80); },
              xPercent: function () { return gsap.utils.random(-80, 80); },
              duration: 0.9,
              ease: 'power4.inOut',
              stagger: { amount: 0.65, from: 'random' },
              onComplete: function () { gsap.set(mosaic, { display: 'none' }); }
            });
          }

          if (mediaImg) {
            gsap.to(mediaImg, {
              scale: 1,
              filter: 'blur(0px)',
              duration: 1.35,
              ease: 'power4.out',
              onComplete: function () {
                gsap.set(mediaImg, { clearProps: 'filter,transform' });
                queueBuildTextures();
              }
            });
          }

          if (contentEls.length) {
            gsap.to(contentEls, {
              autoAlpha: 1,
              y: 0,
              duration: 0.7,
              ease: 'power3.out',
              stagger: 0.12,
              delay: 0.12,
              onComplete: function () { gsap.set(contentEls, { clearProps: 'visibility,opacity,transform' }); }
            });
          }
        }

        entranceTrigger = ScrollTrigger.create({
          trigger: desktop,
          start: 'top 60%',
          once: true,
          onEnter: playEntrance,
          onEnterBack: playEntrance
        });

        window.requestAnimationFrame(function () {
          var rect = section.getBoundingClientRect();
          if (rect.top < window.innerHeight * 0.82 && rect.bottom > 0) playEntrance();
        });
      }

      initRitualEntrance();

      var scrollProgress = 0;
      var activeBase = 0;
      var activeCaption = 0;
      var flying = -1;
      var flightIndex = -1;
      var flightMode = '';
      var dockLinger = 0;

      function setBase(index) {
        if (activeBase === index) return;
        activeBase = index;
        cards.forEach(function (card, i) {
          card.classList.toggle('is-base', i === index);
        });
      }

      function setCaption(index) {
        if (activeCaption === index || !cards[index]) return;
        activeCaption = index;
        if (slideLabel) {
          slideLabel.textContent = (cards[index].dataset.title || '') + ' · ' + String(index + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
        }
      }

      function updateDots(raw) {
        if (!dots) return;
        Array.prototype.slice.call(dots.children).forEach(function (dot, index) {
          var fill = dot.firstElementChild;
          var amount = ritualClamp(raw - index + 1, 0, 1);
          dot.classList.toggle('is-current', index === Math.round(raw));
          if (fill) fill.style.transform = 'scaleX(' + amount + ')';
        });
      }

      function clearDomFlight() {
        if (flying < 0) return;
        var card = cards[flying];
        card.style.opacity = '';
        card.style.transform = '';
        card.style.transformOrigin = '';
        card.style.borderRadius = '';
        card.style.clipPath = '';
        card.style.zIndex = '';
        flying = -1;
      }

      function renderDomFlight(index, t) {
        var card = cards[index];
        if (!card) return;

        if (flying !== index) clearDomFlight();
        flying = index;

        var eased = ritualSmooth(t);
        var radius = 999 - eased * 975;

        card.style.zIndex = '3';
        card.style.opacity = t > 0.015 ? '1' : '0';
        card.style.transformOrigin = '50% 100%';
        card.style.transform = 'translateY(' + ((1 - eased) * 112) + '%) scale(' + (0.72 + eased * 0.28) + ') rotate(' + ((1 - eased) * -5) + 'deg)';
        card.style.borderRadius = radius + 'px';
        card.style.clipPath = 'inset(' + ((1 - eased) * 22) + '% ' + ((1 - eased) * 20) + '% 0 round ' + radius + 'px)';
      }

      function peelRects() {
        var rect = stage.getBoundingClientRect();
        return {
          from: {
            x: rect.left + rect.width * 0.22,
            y: Math.max(window.innerHeight + 36, rect.bottom + rect.height * 0.22),
            w: rect.width * 0.56,
            h: Math.max(96, rect.height * 0.22)
          },
          to: {
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height
          }
        };
      }

      function drawPeel(index, show) {
        var rects = peelRects();
        return peel.draw({
          imageIndex: index,
          from: rects.from,
          to: rects.to,
          show: show,
          r0: Math.min(rects.from.w, rects.from.h) / 2,
          r1: 24
        });
      }

      function render() {
        var last = cards.length - 1;
        var raw = ritualClamp(scrollProgress * last, 0, last);
        var current = Math.floor(raw);

        if (current >= last) current = last - 1;

        var next = current + 1;
        var t = ritualClamp(raw - current, 0, 1);

        setCaption(ritualClamp(Math.round(raw), 0, last));
        updateDots(raw);

        if (t < 0.006 || t > 0.994) {
          var landed = t > 0.994;
          setBase(landed ? next : current);
          clearDomFlight();

          if (landed && flightMode === 'gl' && dockLinger < 3 && peel) {
            dockLinger++;
            if (drawPeel(next, 1)) {
              canvas.style.opacity = '1';
              return;
            }
          }

          flightIndex = -1;
          flightMode = '';
          dockLinger = 0;
          canvas.style.opacity = '0';
          if (peel) peel.clear();
          return;
        }

        dockLinger = 0;
        setBase(current);

        if (flightIndex !== next) {
          flightIndex = next;
          flightMode = peel && peel.isReady(next) ? 'gl' : 'dom';
        }

        if (flightMode === 'gl') {
          var drawn = drawPeel(next, t);
          canvas.style.opacity = drawn ? '1' : '0';
          if (drawn) {
            clearDomFlight();
          } else {
            flightMode = 'dom';
            renderDomFlight(next, t);
          }
        } else {
          canvas.style.opacity = '0';
          if (peel) peel.clear();
          renderDomFlight(next, t);
        }
      }

      if (hasScrollTrigger) {
        ScrollTrigger.create({
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          onUpdate: function (self) { scrollProgress = self.progress; }
        });
        gsap.ticker.add(render);
      } else {
        var ticking = false;
        var onScroll = function () {
          if (ticking) return;
          ticking = true;
          window.requestAnimationFrame(function () {
            ticking = false;
            var distance = Math.max(1, section.offsetHeight - window.innerHeight);
            scrollProgress = ritualClamp((window.scrollY - section.offsetTop) / distance, 0, 1);
            render();
          });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        onScroll();
      }

      render();

      window.addEventListener('load', function () {
        if (hasScrollTrigger) ScrollTrigger.refresh();
        queueBuildTextures();
      });
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

  /* ===== FAQ page: tabbed categories + animated-height accordion ===== */
  function initFaqPage(root) {
    root.querySelectorAll('[data-veylique-faq-page]').forEach(function (section) {
      if (section.dataset.veyliqueFaqPageReady === 'true') return;
      section.dataset.veyliqueFaqPageReady = 'true';

      var tabs = Array.prototype.slice.call(section.querySelectorAll('[data-faq-tab]'));
      var panels = Array.prototype.slice.call(section.querySelectorAll('.veylique-faq-panel'));

      function setAnswerHeight(answer, height) {
        answer.style.height = height + 'px';
      }

      function onAnswerTransitionEnd(answer, state) {
        var done = false;
        var finish = function () {
          if (done) return;
          done = true;
          answer.removeEventListener('transitionend', handler);
          if (answer.dataset.faqState !== state) return;
          if (state === 'opening') {
            answer.style.height = 'auto';
            answer.dataset.faqState = 'open';
          }
          if (state === 'closing') {
            answer.hidden = true;
            answer.dataset.faqState = 'closed';
          }
        };
        var handler = function (event) {
          if (event.target !== answer || event.propertyName !== 'height') return;
          finish();
        };
        answer.addEventListener('transitionend', handler);
        window.setTimeout(finish, 420);
      }

      function openItem(item) {
        var button = item.querySelector('.veylique-faq-question');
        var answer = item.querySelector('.veylique-faq-answer');
        if (!button || !answer || answer.dataset.faqState === 'opening' || answer.dataset.faqState === 'open') return;
        answer.hidden = false;
        answer.dataset.faqState = 'opening';
        answer.style.height = '0px';
        answer.getBoundingClientRect();
        item.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        setAnswerHeight(answer, answer.scrollHeight);
        onAnswerTransitionEnd(answer, 'opening');
      }

      function closeItem(item) {
        var button = item.querySelector('.veylique-faq-question');
        var answer = item.querySelector('.veylique-faq-answer');
        if (!button || !answer || answer.hidden || answer.dataset.faqState === 'closing' || answer.dataset.faqState === 'closed') return;
        answer.dataset.faqState = 'closing';
        setAnswerHeight(answer, answer.scrollHeight);
        answer.getBoundingClientRect();
        item.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        setAnswerHeight(answer, 0);
        onAnswerTransitionEnd(answer, 'closing');
      }

      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var controlledId = tab.getAttribute('aria-controls');
          tabs.forEach(function (item) {
            var selected = item === tab;
            item.classList.toggle('is-active', selected);
            item.setAttribute('aria-selected', selected ? 'true' : 'false');
            item.setAttribute('tabindex', selected ? '0' : '-1');
          });
          panels.forEach(function (panel) {
            var active = panel.id === controlledId;
            panel.classList.toggle('is-active', active);
            panel.hidden = !active;
          });
        });

        tab.addEventListener('keydown', function (event) {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          var current = tabs.indexOf(tab);
          var offset = event.key === 'ArrowRight' ? 1 : -1;
          var next = (current + offset + tabs.length) % tabs.length;
          tabs[next].focus();
          tabs[next].click();
        });
      });

      section.querySelectorAll('[data-faq-item]').forEach(function (item) {
        var button = item.querySelector('.veylique-faq-question');
        var answer = item.querySelector('.veylique-faq-answer');
        if (!button || !answer) return;

        answer.dataset.faqState = answer.hidden ? 'closed' : 'open';
        answer.style.height = answer.hidden ? '0px' : 'auto';

        button.addEventListener('click', function () {
          var isOpen = !answer.hidden;
          var panel = item.closest('.veylique-faq-panel');
          if (panel) {
            panel.querySelectorAll('[data-faq-item]').forEach(function (sibling) {
              if (sibling !== item) closeItem(sibling);
            });
          }
          if (!isOpen) {
            openItem(item);
          } else {
            closeItem(item);
          }
        });
      });
    });
  }

  /* ===== Contact page: native <select> enhanced to a custom listbox ===== */
  var contactSelectControls = [];
  var contactSelectDocBound = false;

  function contactCloseAllSelects(except) {
    contactSelectControls.forEach(function (control) {
      if (control !== except) {
        control.classList.remove('is-open');
        var trigger = control.querySelector('.veylique-contact-select-button');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initContactSelect(root) {
    root.querySelectorAll('.veylique-contact-select').forEach(function (select, index) {
      if (select.dataset.veyliqueSelect) return;
      select.dataset.veyliqueSelect = 'enhanced';
      select.classList.add('veylique-contact-select-native');
      select.setAttribute('aria-hidden', 'true');
      select.tabIndex = -1;

      var id = select.id || 'veylique-contact-select-' + index;
      var label = select.id ? document.querySelector('label[for="' + select.id + '"]') : null;
      var ui = document.createElement('div');
      var button = document.createElement('button');
      var value = document.createElement('span');
      var icon = document.createElement('span');
      var list = document.createElement('div');
      var items = [];

      ui.className = 'veylique-contact-select-ui';
      button.type = 'button';
      button.className = 'veylique-contact-select-button';
      button.setAttribute('aria-haspopup', 'listbox');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', id + '-list');
      button.setAttribute('aria-label', label ? label.textContent.replace('*', '').trim() : id);
      value.className = 'veylique-contact-select-value';
      icon.className = 'veylique-contact-select-icon';
      list.className = 'veylique-contact-select-list';
      list.id = id + '-list';
      list.setAttribute('role', 'listbox');
      list.tabIndex = -1;
      button.appendChild(value);
      button.appendChild(icon);
      ui.appendChild(button);
      ui.appendChild(list);
      select.insertAdjacentElement('afterend', ui);

      function currentOption() {
        return select.options[select.selectedIndex] || select.options[0];
      }

      function sync() {
        var option = currentOption();
        value.textContent = option ? option.textContent : '';
        items.forEach(function (item) {
          var selected = item.dataset.value === select.value;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
      }

      function focusItem(step) {
        var current = items.indexOf(document.activeElement);
        if (current < 0) {
          current = items.findIndex(function (item) { return item.dataset.value === select.value; });
        }
        var next = current + step;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        if (items[next]) items[next].focus();
      }

      function setOpen(open) {
        contactCloseAllSelects(open ? ui : null);
        ui.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          window.requestAnimationFrame(function () {
            var selected = items.find(function (item) { return item.dataset.value === select.value; });
            (selected || items[0] || button).focus();
          });
        }
      }

      function choose(item) {
        select.value = item.dataset.value;
        sync();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        setOpen(false);
        button.focus();
      }

      Array.prototype.forEach.call(select.options, function (option) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'veylique-contact-select-option';
        item.dataset.value = option.value;
        item.textContent = option.textContent;
        item.setAttribute('role', 'option');
        item.addEventListener('click', function () { choose(item); });
        item.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowDown') { event.preventDefault(); focusItem(1); }
          if (event.key === 'ArrowUp') { event.preventDefault(); focusItem(-1); }
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.focus(); }
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(item); }
        });
        items.push(item);
        list.appendChild(item);
      });

      button.addEventListener('click', function () { setOpen(!ui.classList.contains('is-open')); });
      button.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); }
      });

      select.addEventListener('change', sync);
      contactSelectControls.push(ui);
      sync();
    });

    if (!contactSelectDocBound) {
      contactSelectDocBound = true;
      document.addEventListener('click', function (event) {
        if (!contactSelectControls.some(function (control) { return control.contains(event.target); })) {
          contactCloseAllSelects();
        }
      });
    }
  }

  /* ===== Services page: card photo-tilt on hover ===== */
  function initServiceCards(root) {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canHover = window.matchMedia('(hover: hover)').matches;
    if (reduceMotion || !canHover) return;

    root.querySelectorAll('.veylique-svc-card-link').forEach(function (card) {
      if (card.dataset.veyliqueSvcTiltReady === 'true') return;
      card.dataset.veyliqueSvcTiltReady = 'true';
      var imgs = card.querySelectorAll('.veylique-svc-photo img');
      if (!imgs.length) return;
      card.addEventListener('mouseenter', function () {
        imgs.forEach(function (img) { img.style.transform = 'rotate(' + (Math.random() * 30 - 15) + 'deg)'; });
      });
      card.addEventListener('mouseleave', function () {
        imgs.forEach(function (img) { img.style.transform = 'rotate(0deg)'; });
      });
    });
  }

  /* ===== Services page: scroll-driven sticky "Method" showcase =====
     As each step crosses the viewport centre its name lights up, its photo
     springs into the sticky panel (scale + rotate, expo.out), and the sticky
     description swaps; the panel drifts with the mouse. GSAP-gated. */
  function initServiceMethod(root) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    root.querySelectorAll('[data-svc-steps]').forEach(function (wrap) {
      if (wrap.dataset.veyliqueSvcMethodReady === 'true') return;
      wrap.dataset.veyliqueSvcMethodReady = 'true';

      gsap.registerPlugin(ScrollTrigger);

      var steps = gsap.utils.toArray(wrap.querySelectorAll('[data-svc-step]'));
      var names = gsap.utils.toArray(wrap.querySelectorAll('[data-svc-step-name]'));
      var imgs = gsap.utils.toArray(wrap.querySelectorAll('[data-svc-img]'));
      var descs = gsap.utils.toArray(wrap.querySelectorAll('[data-svc-desc]'));
      var imgsOuter = wrap.querySelector('[data-svc-imgs-outer]');
      var imgsWrap = wrap.querySelector('[data-svc-imgs]');
      if (!steps.length || !imgsWrap) return;

      gsap.set(names, { autoAlpha: 0 });
      gsap.set(imgsWrap, { scale: 0, rotate: 45 });
      gsap.set(imgs, { autoAlpha: 0, scale: 0, rotate: 45, yPercent: -50 });
      gsap.set(descs, { autoAlpha: 0, scale: 0.75, xPercent: 25 });

      function showStep(index, skipMedia) {
        gsap.to(names, { autoAlpha: 0, duration: 0.5, ease: 'expo.out' });
        gsap.to(names[index], { autoAlpha: 1, duration: 0.5, ease: 'expo.out' });
        if (skipMedia) return;

        imgs.forEach(function (img, i) {
          if (i === index) return;
          gsap.to(img, { autoAlpha: 0, scale: 0, yPercent: -50, rotate: -45, duration: 0.66, ease: 'expo.out' });
        });
        gsap.fromTo(imgs[index],
          { autoAlpha: 0, scale: 0, rotate: 45, yPercent: 50 },
          { autoAlpha: 1, scale: 1, rotate: 0, yPercent: 0, duration: 0.66, ease: 'expo.out' });

        descs.forEach(function (desc, i) {
          if (i === index) return;
          gsap.to(desc, { autoAlpha: 0, scale: 0.75, xPercent: 25, duration: 0.66, ease: 'expo.out' });
        });
        gsap.fromTo(descs[index],
          { autoAlpha: 0, scale: 0.75, xPercent: -25 },
          { autoAlpha: 1, scale: 1, xPercent: 0, duration: 0.66, ease: 'expo.out' });
      }

      ScrollTrigger.create({
        trigger: imgsWrap,
        start: 'bottom 80%',
        onEnter: function () {
          gsap.to(imgsWrap, { rotate: 0, scale: 1, duration: 1, ease: 'expo.out' });
          gsap.to(imgs[0], { autoAlpha: 1, rotate: 0, scale: 1, yPercent: 0, duration: 1, ease: 'expo.out', delay: 0.22 });
          gsap.to(names[0], { autoAlpha: 1, duration: 1, ease: 'expo.out', delay: 0.22 });
          gsap.fromTo(descs[0],
            { autoAlpha: 0, scale: 0.75, xPercent: -25 },
            { autoAlpha: 1, scale: 1, xPercent: 0, duration: 1, ease: 'expo.out', delay: 0.44 });
        },
        onLeaveBack: function () {
          gsap.to(imgsWrap, { rotate: 45, scale: 0, duration: 1, ease: 'expo.out', delay: 0.22 });
          gsap.to(imgs[0], { autoAlpha: 0, rotate: 45, scale: 0, duration: 1, ease: 'expo.out' });
          gsap.to(names[0], { autoAlpha: 0, duration: 1, ease: 'expo.out' });
          gsap.to(descs[0], { autoAlpha: 0, scale: 0.75, xPercent: 25, duration: 0.66, ease: 'expo.out' });
        }
      });

      steps.forEach(function (el, index) {
        ScrollTrigger.create({
          trigger: el,
          start: 'top center',
          onEnter: function () { showStep(index, index === 0); },
          onLeaveBack: function () { if (index > 0) showStep(index - 1); }
        });
      });

      if (imgsOuter && window.matchMedia('(hover: hover)').matches) {
        var quickX = gsap.quickTo(imgsOuter, 'x', { duration: 0.6, ease: 'power3.out' });
        var quickRotate = gsap.quickTo(imgsOuter, 'rotation', { duration: 0.6, ease: 'power3.out' });
        window.addEventListener('mousemove', function (event) {
          var relativeX = (event.clientX / window.innerWidth) * 2 - 1;
          quickX(relativeX * 40);
          quickRotate(relativeX * 4);
        });
      }
    });
  }

  function init() {
    initFaq(document);
    initHeroes(document);
    initHeader(document);
    initFooter(document);
    initCategoryCarousels(document);
    initSectionIntroReveal(document);
    initReveals(document);
    initProductCards(document);
    initArrivals(document);
    initCardSliders(document);
    initOccasions(document);
    initTestimonials(document);
    initRituals(document);
    initHomeFaqs(document);
    initFaqPage(document);
    initContactSelect(document);
    initServiceCards(document);
    initServiceMethod(document);
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
    initSectionIntroReveal(event.target);
    initReveals(event.target);
    initProductCards(event.target);
    initArrivals(event.target);
    initCardSliders(event.target);
    initOccasions(event.target);
    initTestimonials(event.target);
    initRituals(event.target);
    initHomeFaqs(event.target);
    initFaqPage(event.target);
    initContactSelect(event.target);
    initServiceCards(event.target);
    initServiceMethod(event.target);
    initBlogs(event.target);
  });
})();
