
/* ===== main.js ===== */


(function () {
  'use strict';

  document.documentElement.classList.add('lumea-js-ready');

  var WISHLIST_STORAGE_KEY = 'lumeaWishlist';

  function i18n(key, fallback) {
    if (window.lumeaData && window.lumeaData.i18n && window.lumeaData.i18n[key]) {
      return String(window.lumeaData.i18n[key]);
    }
    return fallback;
  }

  function i18nWithName(templateKey, fallbackTemplate, name) {
    var template = i18n(templateKey, fallbackTemplate);
    return template.indexOf('%s') !== -1 ? template.replace('%s', name) : (template + ' ' + name);
  }

  function toPositiveInt(value) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function normalizeWishlistIds(ids) {
    var map = {};
    var clean = [];

    (ids || []).forEach(function (id) {
      var normalized = toPositiveInt(id);
      if (!normalized || map[normalized]) {
        return;
      }
      map[normalized] = true;
      clean.push(normalized);
    });

    return clean;
  }

  function getWishlistIds() {
    try {
      var stored = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (!stored) {
        return [];
      }
      var parsed = JSON.parse(stored);
      return normalizeWishlistIds(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      return [];
    }
  }

  function setWishlistIds(ids) {
    var normalized = normalizeWishlistIds(ids);
    try {
      window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      return normalized;
    }
    return normalized;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseMarkup(markup) {
    var parsed = new DOMParser().parseFromString('<div data-lumea-parser-root>' + String(markup || '') + '</div>', 'text/html');
    var source = parsed.querySelector('[data-lumea-parser-root]');
    var fragment = document.createDocumentFragment();

    if (!source) {
      return fragment;
    }

    Array.prototype.slice.call(source.childNodes).forEach(function (node) {
      fragment.appendChild(document.importNode(node, true));
    });

    return fragment;
  }

  function replaceChildrenFromNode(target, source) {
    var fragment = document.createDocumentFragment();
    Array.prototype.slice.call(source.childNodes).forEach(function (node) {
      fragment.appendChild(document.importNode(node, true));
    });
    target.replaceChildren(fragment);
  }

  function sanitizeClassToken(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'simple';
  }

  function getWishlistButtonProductId(button) {
    if (!button) {
      return 0;
    }

    var directId = button.getAttribute('data-product_id') || button.getAttribute('data-wishlist-toggle');
    if (directId) {
      return toPositiveInt(directId);
    }

    var productRoot = button.closest('.lumea-best-card, .lumea-lp-card, .lumea-shop-card, .product, .type-product');
    if (!productRoot) {
      return 0;
    }

    var productButton = productRoot.querySelector('[data-product_id]');
    if (productButton) {
      return toPositiveInt(productButton.getAttribute('data-product_id'));
    }

    return 0;
  }

  function getAllWishlistButtons() {
    return document.querySelectorAll('[data-lumea-wish], [data-wishlist-toggle]');
  }

  function setWishlistButtonState(button, isActive) {
    var activeClass = button.hasAttribute('data-wishlist-toggle') ? 'is-active' : 'is-wished';
    button.classList.toggle(activeClass, isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.setAttribute('aria-label', isActive ? i18n('removeFromWishlist', 'Remove from wishlist') : i18n('addToWishlist', 'Add to wishlist'));
  }

  function syncWishlistButtons() {
    var ids = getWishlistIds();

    getAllWishlistButtons().forEach(function (button) {
      var productId = getWishlistButtonProductId(button);
      if (!productId) {
        setWishlistButtonState(button, false);
        return;
      }
      setWishlistButtonState(button, ids.indexOf(productId) !== -1);
    });
  }

  function updateWishlistCountBadge() {
    var count = getWishlistIds().length;
    var badges = document.querySelectorAll('.lumea-wishlist-count');

    badges.forEach(function (badge) {
      if (!badge) {
        return;
      }
      if (count > 0) {
        badge.textContent = String(count);
        badge.classList.add('lumea-wishlist-count--visible');
      } else {
        badge.textContent = '';
        badge.classList.remove('lumea-wishlist-count--visible');
      }
    });
  }

  function setWishlistCountText(count) {
    document.querySelectorAll('[data-lumea-wishlist-count-text]').forEach(function (node) {
      node.textContent = String(count);
    });
  }

  function revealWishlistBelow() {
    var below = document.querySelector('[data-lumea-wishlist-below]');
    if (below) {
      below.hidden = false;
    }
  }

  function renderWishlistPage(items) {
    var list = document.querySelector('[data-lumea-wishlist-page-items]');
    var empty = document.querySelector('[data-lumea-wishlist-page-empty]');

    if (!list || !empty) {
      revealWishlistBelow();
      return;
    }

    if (!items.length) {
      list.replaceChildren();
      empty.hidden = false;
      revealWishlistBelow();
      return;
    }

    empty.hidden = true;

    var wishlistMarkup = items.map(function (item) {
      var actionLabel = item.can_add_to_cart ? (item.cart_text || i18n('addToCart', 'Add to Cart')) : i18n('viewProduct', 'View Product');
      var actionAria = item.cart_aria || actionLabel;
      var removeLabel = i18nWithName('removeFromWishlistOf', 'Remove %s from wishlist', item.name);
      var cartUrl = (window.lumeaData && window.lumeaData.cartUrl) ? window.lumeaData.cartUrl : '#';
      var removeText = i18n('remove', 'Remove');
      var qtyLabel = i18n('quantity', 'Quantity');
      var decreaseLabel = i18n('decrease', 'Decrease');
      var increaseLabel = i18n('increase', 'Increase');
      var viewCartLabel = i18n('viewCart', 'View Cart');
      var productType = sanitizeClassToken(item.type);
      var atcButtonClass = 'lumea-btn btn-black add_to_cart_button button product_type_' + productType;
      var actionMarkup = '';

      if (item.can_add_to_cart) {
        if (item.supports_ajax) {
          atcButtonClass += ' ajax_add_to_cart';
        }
        actionMarkup = [
          '<div class="lumea-card-actions lumea-wishlist-page-card-actions">',
            '<div class="lumea-card-atc-wrap">',
              '<a href="' + escapeHtml(item.cart_url) + '" class="' + escapeHtml(atcButtonClass) + '" data-product_id="' + item.id + '" data-product_type="' + escapeHtml(productType) + '" data-quantity="1" rel="nofollow" aria-label="' + escapeHtml(actionAria) + '">',
                escapeHtml(actionLabel),
              '</a>',
              '<div class="lumea-qty-stepper" aria-label="' + escapeHtml(qtyLabel) + '" data-lumea-qty>',
                '<button class="lumea-qty-btn lumea-qty-minus" type="button" aria-label="' + escapeHtml(decreaseLabel) + '">&#8722;</button>',
                '<span class="lumea-qty-num">1</span>',
                '<button class="lumea-qty-btn lumea-qty-plus" type="button" aria-label="' + escapeHtml(increaseLabel) + '" data-product_id="' + item.id + '">&#43;</button>',
              '</div>',
            '</div>',
            '<a href="' + escapeHtml(cartUrl) + '" class="lumea-view-cart-btn" data-lumea-view-cart>',
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 01-8 0"></path></svg>',
              '<span>' + escapeHtml(viewCartLabel) + '</span>',
            '</a>',
          '</div>'
        ].join('');
      } else {
        actionMarkup = '<a href="' + escapeHtml(item.url) + '" class="lumea-btn btn-black lumea-wishlist-page-plain-btn" aria-label="' + escapeHtml(actionAria) + '">' + escapeHtml(actionLabel) + '</a>';
      }

      return [
        '<article class="lumea-wishlist-page-item">',
          '<button class="lumea-wishlist-page-remove" type="button" data-lumea-wishlist-remove="' + item.id + '" aria-label="' + escapeHtml(removeLabel) + '">',
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
            '<span>' + escapeHtml(removeText) + '</span>',
          '</button>',
          '<a class="lumea-wishlist-page-media" href="' + escapeHtml(item.url) + '">',
            item.image ? '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">' : '<span class="lumea-wishlist-page-placeholder" aria-hidden="true"></span>',
          '</a>',
          '<div class="lumea-wishlist-page-main">',
            '<div class="lumea-wishlist-page-info">',
              '<h2 class="lumea-wishlist-page-item-title"><a href="' + escapeHtml(item.url) + '">' + escapeHtml(item.name) + '</a></h2>',
              '<p class="lumea-wishlist-page-item-price">' + escapeHtml(item.price) + '</p>',
            '</div>',
            actionMarkup,
          '</div>',
        '</article>'
      ].join('');
    }).join('');

    list.replaceChildren(parseMarkup(wishlistMarkup));

    revealWishlistBelow();
  }

  function fetchWishlistItems(ids) {
    if (typeof window.lumeaData === 'undefined' || !window.lumeaData.ajaxUrl || !window.lumeaData.nonce) {
      return Promise.resolve([]);
    }

    var body = 'action=lumea_wishlist_items&nonce=' + encodeURIComponent(window.lumeaData.nonce);
    ids.forEach(function (id) {
      body += '&ids[]=' + encodeURIComponent(String(id));
    });

    return fetch(window.lumeaData.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (payload) {
        if (!payload || !payload.success || !Array.isArray(payload.data)) {
          return [];
        }
        return payload.data;
      })
      .catch(function () {
        return [];
      });
  }

  function refreshWishlistPanels() {
    var ids = getWishlistIds();

    setWishlistCountText(ids.length);

    if (!ids.length) {
      renderWishlistPage([]);
      return;
    }

    fetchWishlistItems(ids).then(function (items) {
      renderWishlistPage(items);
    });
  }

  function refreshWishlistUI() {
    syncWishlistButtons();
    updateWishlistCountBadge();
    refreshWishlistPanels();
  }

  function toggleWishlistById(productId) {
    if (!productId) {
      return;
    }

    var ids = getWishlistIds();
    var index = ids.indexOf(productId);

    if (index === -1) {
      ids.push(productId);
    } else {
      ids.splice(index, 1);
    }

    setWishlistIds(ids);
    refreshWishlistUI();
  }

  function removeFromWishlist(productId) {
    var ids = getWishlistIds().filter(function (id) {
      return id !== productId;
    });
    setWishlistIds(ids);
    refreshWishlistUI();
  }

  /* Scroll-down button */
  var scrollDownBtn = document.querySelector('.lumea-scroll-down, .lumea-about-scroll-down');
  if (scrollDownBtn) {
    scrollDownBtn.addEventListener('click', function () {
      var hero = document.querySelector('.lumea-page-hero') || document.querySelector('.hero');
      if (hero) {
        window.scrollTo({ top: hero.offsetTop + hero.offsetHeight, behavior: 'smooth' });
      }
    });
  }

  /* Sticky Header */
  var header = document.getElementById('lumeaHeader');

  if (header) {
    function getHeaderThreshold() {
      return 40;
    }

    function updateHeader() {
      var current = window.scrollY;
      header.classList.toggle('is-scrolled', current > getHeaderThreshold());
    }

    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    window.addEventListener('resize', updateHeader);
  }

  /* Mobile Nav */
  var mobileNav = document.querySelector('[data-lumea-mobile-nav]');
  var navToggle = document.querySelector('[data-lumea-nav-toggle]');
  var navCloses = document.querySelectorAll('[data-lumea-nav-close]');

  function updateMobileNavOrigin() {
    if (!mobileNav || !navToggle) {
      return;
    }

    var navRect = mobileNav.getBoundingClientRect();
    var toggleRect = navToggle.getBoundingClientRect();
    var originX = toggleRect.left + toggleRect.width / 2 - navRect.left;
    var originY = toggleRect.top + toggleRect.height / 2 - navRect.top;

    mobileNav.style.setProperty('--mustard-mobile-nav-origin-x', originX + 'px');
    mobileNav.style.setProperty('--mustard-mobile-nav-origin-y', originY + 'px');
  }

  function setMobileNav(isOpen) {
    if (!mobileNav || !navToggle) {
      return;
    }
    if (isOpen) {
      updateMobileNavOrigin();
    }
    mobileNav.classList.toggle('is-open', isOpen);
    navToggle.classList.toggle('is-open', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    var navI18n = (window.lumeaData && window.lumeaData.i18n) || {};
    navToggle.setAttribute('aria-label', isOpen ? navI18n.closeMenu || 'Close menu' : navI18n.openMenu || 'Open menu');
    mobileNav.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    mobileNav.toggleAttribute('inert', !isOpen);
    document.body.classList.toggle('lumea-nav-open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function () {
      setMobileNav(!mobileNav.classList.contains('is-open'));
    });

    navCloses.forEach(function (closeBtn) {
      closeBtn.addEventListener('click', function () {
        setMobileNav(false);
      });
    });

    mobileNav.querySelectorAll('nav a').forEach(function (link) {
      link.addEventListener('click', function () {
        setMobileNav(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && mobileNav.classList.contains('is-open')) {
        setMobileNav(false);
      }
    });

    window.addEventListener('resize', function () {
      if (mobileNav.classList.contains('is-open')) {
        updateMobileNavOrigin();
      }
    });
  }

  /* Search Overlay */
  var searchOverlay = document.querySelector('[data-lumea-search-overlay]');
  var searchTriggers = document.querySelectorAll('[data-lumea-search-trigger]');
  var searchCloses = document.querySelectorAll('[data-lumea-search-close]');
  var searchInput = searchOverlay ? searchOverlay.querySelector('input[type="search"]') : null;
  var searchClear = searchOverlay ? searchOverlay.querySelector('[data-lumea-search-clear]') : null;
  var searchRainCanvas = searchOverlay ? searchOverlay.querySelector('[data-lumea-search-rain]') : null;
  var searchRainCtx = searchRainCanvas ? searchRainCanvas.getContext('2d') : null;
  var searchRain = null;
  var searchRainImage = null;
  var searchRainReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lastSearchTrigger = null;

  function updateSearchClear() {
    if (!searchInput || !searchClear) {
      return;
    }

    searchClear.hidden = !searchInput.value.trim();
  }

  function resizeSearchRain() {
    if (!searchRainCanvas || !searchRainCtx) {
      return;
    }

    var rect = searchOverlay.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));

    searchRainCanvas.width = width;
    searchRainCanvas.height = height;
    searchRainCanvas.style.width = width + 'px';
    searchRainCanvas.style.height = height + 'px';
  }

  function getSearchRainFallback(width, height) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = Math.max(1, width || 1200);
    canvas.height = Math.max(1, height || 800);

    var base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    base.addColorStop(0, '#2a1b18');
    base.addColorStop(0.45, '#4a2924');
    base.addColorStop(1, '#160f0e');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var glow = ctx.createRadialGradient(canvas.width * 0.2, canvas.height * 0.18, 0, canvas.width * 0.2, canvas.height * 0.18, canvas.width * 0.55);
    glow.addColorStop(0, 'rgba(255,245,236,0.28)');
    glow.addColorStop(1, 'rgba(255,245,236,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var glowTwo = ctx.createRadialGradient(canvas.width * 0.82, canvas.height * 0.72, 0, canvas.width * 0.82, canvas.height * 0.72, canvas.width * 0.48);
    glowTwo.addColorStop(0, 'rgba(201,133,120,0.26)');
    glowTwo.addColorStop(1, 'rgba(201,133,120,0)');
    ctx.fillStyle = glowTwo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png');
  }

  function getSearchRainSource(width, height) {
    var source = searchRainCanvas ? searchRainCanvas.getAttribute('data-lumea-rain-image') : '';
    if (!source) {
      return getSearchRainFallback(width, height);
    }

    try {
      if (new URL(source, window.location.href).origin !== window.location.origin) {
        return getSearchRainFallback(width, height);
      }
    } catch (e) {
      return getSearchRainFallback(width, height);
    }

    return source;
  }

  function createSearchRain(image, isFallback) {
    if (!searchOverlay || !searchOverlay.classList.contains('is-open') || !searchRainCanvas || typeof RainyDay === 'undefined') {
      return;
    }

    try {
      searchRain = new RainyDay({
        image: image,
        parentElement: searchOverlay,
        enableSizeChange: false,
        width: searchRainCanvas.width,
        height: searchRainCanvas.height,
        crop: [0, 0, image.naturalWidth || searchRainCanvas.width, image.naturalHeight || searchRainCanvas.height],
        blur: 10,
        opacity: 0.92,
        fps: 30
      }, searchRainCanvas);
      searchRain.rain([[1, 0, 20], [3, 3, 1]], 100);
    } catch (e) {
      if (!isFallback) {
        loadSearchRainImage(getSearchRainFallback(searchRainCanvas.width, searchRainCanvas.height), true);
      }
    }
  }

  function loadSearchRainImage(source, isFallback) {
    var image = new Image();
    searchRainImage = image;
    image.onload = function () {
      if (searchRainImage !== image) {
        return;
      }
      createSearchRain(image, isFallback);
    };
    image.onerror = function () {
      if (!isFallback) {
        loadSearchRainImage(getSearchRainFallback(searchRainCanvas.width, searchRainCanvas.height), true);
      }
    };
    image.src = source;
  }

  function startSearchRain() {
    if (searchRainReduced || !searchRainCanvas || !searchRainCtx || typeof RainyDay === 'undefined') {
      return;
    }

    stopSearchRain();
    resizeSearchRain();
    loadSearchRainImage(getSearchRainSource(searchRainCanvas.width, searchRainCanvas.height), false);
  }

  function stopSearchRain() {
    if (searchRain && typeof searchRain.pause === 'function') {
      searchRain.pause();
    }
    searchRain = null;
    searchRainImage = null;
    if (searchRainCtx && searchRainCanvas) {
      searchRainCtx.clearRect(0, 0, searchRainCanvas.width, searchRainCanvas.height);
    }
  }

  function openSearchOverlay() {
    if (!searchOverlay) {
      return;
    }
    searchOverlay.classList.add('is-open');
    searchOverlay.setAttribute('aria-hidden', 'false');
    searchOverlay.removeAttribute('inert');
    document.body.style.overflow = 'hidden';
    startSearchRain();

    updateSearchClear();
    if (searchInput) {
      window.setTimeout(function () {
        searchInput.focus();
      }, 50);
    }
  }

  function closeSearchOverlay() {
    if (!searchOverlay) {
      return;
    }
    searchOverlay.classList.remove('is-open');
    searchOverlay.setAttribute('aria-hidden', 'true');
    searchOverlay.setAttribute('inert', '');
    document.body.style.overflow = '';
    stopSearchRain();
    if (lastSearchTrigger) { lastSearchTrigger.focus(); lastSearchTrigger = null; }
  }

  if (searchOverlay && searchTriggers.length) {
    searchTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        lastSearchTrigger = trigger;
        openSearchOverlay();
      });
    });

    searchCloses.forEach(function (closeBtn) {
      closeBtn.addEventListener('click', closeSearchOverlay);
    });

    if (searchInput && searchClear) {
      searchInput.addEventListener('input', updateSearchClear);
      searchClear.addEventListener('click', function () {
        searchInput.value = '';
        updateSearchClear();
        searchInput.focus();
      });
      updateSearchClear();
    }

    searchOverlay.addEventListener('click', function (event) {
      if (event.target === searchOverlay) {
        closeSearchOverlay();
      }
    });

    window.addEventListener('resize', function () {
      if (searchOverlay.classList.contains('is-open')) {
        startSearchRain();
      }
    });
  }

  /* Account dropdown */
  var accountWrap = document.querySelector('[data-lumea-account-wrap]');
  var accountTrigger = document.querySelector('[data-lumea-account-trigger]');
  var accountDropdown = document.querySelector('[data-lumea-account-dropdown]');

  function closeAccountDropdown() {
    if (!accountTrigger || !accountDropdown) {
      return;
    }
    accountTrigger.setAttribute('aria-expanded', 'false');
    accountDropdown.classList.remove('is-open');
    accountDropdown.setAttribute('aria-hidden', 'true');
    accountDropdown.setAttribute('inert', '');
  }

  function toggleAccountDropdown() {
    if (!accountTrigger || !accountDropdown) {
      return;
    }

    var willOpen = accountTrigger.getAttribute('aria-expanded') !== 'true';
    accountTrigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    accountDropdown.classList.toggle('is-open', willOpen);
    accountDropdown.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
    accountDropdown.toggleAttribute('inert', !willOpen);
  }

  if (accountTrigger && accountDropdown) {
    accountTrigger.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleAccountDropdown();
    });

    document.addEventListener('click', function (event) {
      if (!accountWrap || accountWrap.contains(event.target)) {
        return;
      }
      closeAccountDropdown();
    });
  }

  /* Mega menu — one shared panel shell; only the inner content swaps
     per trigger, so the background/border/shadow never flickers when
     moving between Top wear / Bottom wear / Festive / Winterwear / Sale. */
  var megaWraps = document.querySelectorAll('[data-lumea-mega-wrap]');
  var megaPanel = document.querySelector('[data-lumea-mega-panel]');
  var megaContents = megaPanel ? megaPanel.querySelectorAll('[data-mega-content]') : [];
  var megaInstances = [];
  var megaCloseTimer = null;

  megaWraps.forEach(function (wrap) {
    var trigger = wrap.querySelector('[data-lumea-mega-trigger]');
    var targetKey = trigger ? trigger.getAttribute('data-lumea-mega-target') : null;
    if (!trigger || !targetKey) {
      return;
    }
    megaInstances.push({ wrap: wrap, trigger: trigger, targetKey: targetKey });
  });

  function showMegaContent(targetKey) {
    megaContents.forEach(function (content) {
      content.hidden = content.getAttribute('data-mega-content') !== targetKey;
    });
  }

  function openMegaMenu(instance) {
    if (!megaPanel) {
      return;
    }
    clearTimeout(megaCloseTimer);
    showMegaContent(instance.targetKey);
    megaInstances.forEach(function (other) {
      other.trigger.setAttribute('aria-expanded', other === instance ? 'true' : 'false');
    });
    megaPanel.classList.add('is-open');
    megaPanel.setAttribute('aria-hidden', 'false');
    megaPanel.removeAttribute('inert');
  }

  function closeMegaMenu() {
    if (!megaPanel) {
      return;
    }
    megaInstances.forEach(function (instance) {
      instance.trigger.setAttribute('aria-expanded', 'false');
    });
    megaPanel.classList.remove('is-open');
    megaPanel.setAttribute('aria-hidden', 'true');
    megaPanel.setAttribute('inert', '');
  }

  function scheduleMegaClose() {
    clearTimeout(megaCloseTimer);
    megaCloseTimer = setTimeout(closeMegaMenu, 150);
  }

  if (megaPanel && megaInstances.length) {
    megaInstances.forEach(function (instance) {
      instance.wrap.addEventListener('mouseenter', function () {
        openMegaMenu(instance);
      });
      instance.wrap.addEventListener('mouseleave', scheduleMegaClose);

      instance.trigger.addEventListener('click', function (event) {
        event.preventDefault();
        var isThisOpen = megaPanel.classList.contains('is-open') && instance.trigger.getAttribute('aria-expanded') === 'true';
        if (isThisOpen) {
          closeMegaMenu();
        } else {
          openMegaMenu(instance);
        }
      });

      instance.trigger.addEventListener('focus', function () {
        openMegaMenu(instance);
      });
    });

    megaPanel.addEventListener('mouseenter', function () {
      clearTimeout(megaCloseTimer);
    });
    megaPanel.addEventListener('mouseleave', scheduleMegaClose);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMegaMenu();
      }
    });

    document.addEventListener('click', function (event) {
      var withinAny = megaInstances.some(function (instance) {
        return instance.wrap.contains(event.target);
      }) || megaPanel.contains(event.target);
      if (!withinAny) {
        closeMegaMenu();
      }
    });

    document.addEventListener('focusin', function (event) {
      var withinAny = megaInstances.some(function (instance) {
        return instance.wrap.contains(event.target);
      }) || megaPanel.contains(event.target);
      if (!withinAny) {
        closeMegaMenu();
      }
    });
  }

  /* Auth tabs (login/register) */
  var authTabButtons = document.querySelectorAll('[data-lumea-auth-tab]');
  var authPanels = document.querySelectorAll('.lumea-login-pane[role="tabpanel"]');

  function setActiveAuthTab(targetTab) {
    if (!targetTab) {
      return;
    }

    authTabButtons.forEach(function (button) {
      var isMatch = button.getAttribute('data-lumea-auth-tab') === targetTab;
      button.classList.toggle('is-active', isMatch);
      button.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      button.setAttribute('tabindex', isMatch ? '0' : '-1');
    });

    authPanels.forEach(function (panel) {
      var panelId = panel.id || '';
      var isPanelMatch = (targetTab === 'login' && panelId === 'lumeaLoginPanel') || (targetTab === 'register' && panelId === 'lumeaRegisterPanel');
      panel.classList.toggle('is-active', isPanelMatch);
      panel.hidden = !isPanelMatch;
    });
  }

  if (authTabButtons.length && authPanels.length) {
    var initialActiveTab = null;
    var authHash = window.location.hash ? window.location.hash.toLowerCase() : '';

    authTabButtons.forEach(function (button) {
      if (button.classList.contains('is-active') && !initialActiveTab) {
        initialActiveTab = button.getAttribute('data-lumea-auth-tab');
      }
    });

    if (!initialActiveTab && (authHash === '#lumearegistercard' || authHash === '#lumearegisterpanel')) {
      initialActiveTab = 'register';
    }

    if (!initialActiveTab) {
      initialActiveTab = authTabButtons[0].getAttribute('data-lumea-auth-tab');
    }

    setActiveAuthTab(initialActiveTab);

    authTabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var requestedTab = button.getAttribute('data-lumea-auth-tab');
        setActiveAuthTab(requestedTab);
      });
    });
  }

  /* Exact auth reference switch (b.html behavior) */
  var authRefContainer = document.querySelector('[data-lumea-auth-ref-container]');
  var authRefButtons = document.querySelectorAll('[data-lumea-auth-ref-open]');

  if (authRefContainer && authRefButtons.length) {
    var authRefMobileQuery = window.matchMedia( '(max-width: 860px)' );
    var authRefReducedMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' );
    var authRefLoginPanel = authRefContainer.querySelector( '.lumea-auth-ref-login' );
    var authRefRegisterPanel = authRefContainer.querySelector( '.lumea-auth-ref-register' );
    var authRefFrontPage = authRefContainer.querySelector( '.lumea-auth-ref-page-front' );
    var authRefBackPage = authRefContainer.querySelector( '.lumea-auth-ref-page-back' );
    var authRefSwitch = authRefContainer.querySelector( '.lumea-auth-ref-switch' );
    var authRefSwitchOptions = authRefContainer.querySelectorAll( '.lumea-auth-ref-switch-option' );

    /* Pin the container to the taller of the two forms, plus room for the
       switch pinned to the bottom, so neither the page nor the switch itself
       ever shifts when toggling between login and signup. */
    function lockAuthRefMobileHeight() {
      if ( ! authRefMobileQuery.matches ) {
        authRefContainer.style.minHeight = '';
        return;
      }

      var savedLoginDisplay = authRefLoginPanel ? authRefLoginPanel.style.display : '';
      var savedRegisterDisplay = authRefRegisterPanel ? authRefRegisterPanel.style.display : '';

      authRefContainer.style.minHeight = '';
      if ( authRefLoginPanel ) authRefLoginPanel.style.display = 'flex';
      if ( authRefRegisterPanel ) authRefRegisterPanel.style.display = 'none';
      var loginTotal = authRefContainer.scrollHeight;

      if ( authRefLoginPanel ) authRefLoginPanel.style.display = 'none';
      if ( authRefRegisterPanel ) authRefRegisterPanel.style.display = 'flex';
      var registerTotal = authRefContainer.scrollHeight;

      if ( authRefLoginPanel ) authRefLoginPanel.style.display = savedLoginDisplay;
      if ( authRefRegisterPanel ) authRefRegisterPanel.style.display = savedRegisterDisplay;

      var switchGap = parseFloat( getComputedStyle( document.documentElement ).fontSize ) * 1.25;
      var switchHeight = authRefSwitch ? authRefSwitch.getBoundingClientRect().height : 0;

      authRefContainer.style.minHeight = ( Math.max( loginTotal, registerTotal ) + switchGap + switchHeight ) + 'px';
    }

    lockAuthRefMobileHeight();

    var authRefResizeTimer;
    window.addEventListener( 'resize', function () {
      window.clearTimeout( authRefResizeTimer );
      authRefResizeTimer = window.setTimeout( lockAuthRefMobileHeight, 200 );
    } );

    /* Crossfade + slide the login/register card. */
    function animateAuthRefMobileSwitch( showRegister, pair ) {
      var offset = showRegister ? 10 : -10;

      authRefContainer.dataset.transitioning = 'true';

      if ( pair.from ) {
        pair.from.style.display = 'flex';
        pair.from.style.transform = 'translateX(' + ( -offset ) + 'px)';
        pair.from.style.opacity = '0';
      }
      if ( pair.to ) {
        pair.to.style.display = 'none';
      }

      window.setTimeout( function () {
        if ( pair.from ) pair.from.style.display = 'none';
        if ( pair.to ) {
          pair.to.style.display = 'flex';
          pair.to.style.transform = 'translateX(' + offset + 'px)';
          pair.to.style.opacity = '0';
        }

        requestAnimationFrame( function () {
          if ( ! pair.to ) return;
          pair.to.style.transform = 'translateX(0)';
          pair.to.style.opacity = '1';
        } );
      }, 220 );

      window.setTimeout( function () {
        [ pair.from, pair.to ].forEach( function ( panel ) {
          if ( ! panel ) return;
          panel.style.display = '';
          panel.style.transform = '';
          panel.style.opacity = '';
        } );
        delete authRefContainer.dataset.transitioning;
      }, 520 );
    }

    function setAuthRefState( target ) {
      var showRegister = target === 'register';
      var loginPanel = authRefLoginPanel;
      var registerPanel = authRefRegisterPanel;
      var frontPage = authRefFrontPage;
      var backPage = authRefBackPage;

      var alreadyShowing = authRefContainer.classList.contains( 'active' ) === showRegister;
      var canAnimate = authRefMobileQuery.matches
        && ! authRefReducedMotion.matches
        && ! authRefContainer.dataset.transitioning
        && ! alreadyShowing;

      if ( canAnimate ) {
        animateAuthRefMobileSwitch( showRegister, {
          from: showRegister ? loginPanel : registerPanel,
          to: showRegister ? registerPanel : loginPanel
        } );
      }

      [ loginPanel, frontPage ].forEach( function ( panel ) {
        if ( ! panel ) return;
        panel.setAttribute( 'aria-hidden', showRegister ? 'true' : 'false' );
        panel.toggleAttribute( 'inert', showRegister );
      } );

      [ registerPanel, backPage ].forEach( function ( panel ) {
        if ( ! panel ) return;
        panel.setAttribute( 'aria-hidden', showRegister ? 'false' : 'true' );
        panel.toggleAttribute( 'inert', ! showRegister );
      } );

      authRefContainer.classList.toggle( 'active', showRegister );
      authRefContainer.classList.toggle( 'close', ! showRegister );

      if ( authRefSwitch ) {
        authRefSwitch.classList.toggle( 'is-register', showRegister );
      }
      authRefSwitchOptions.forEach( function ( option ) {
        var isActive = option.getAttribute( 'data-lumea-auth-ref-open' ) === target;
        option.classList.toggle( 'is-active', isActive );
        option.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
      } );

      var focusTarget = showRegister
        ? document.getElementById( 'reg_username' )
        : document.getElementById( 'username' );
      if ( focusTarget ) {
        window.setTimeout( function () { focusTarget.focus(); }, canAnimate ? 260 : 650 );
      }
    }

    var authRefSwitchThumb = authRefSwitch ? authRefSwitch.querySelector( '.lumea-auth-ref-switch-thumb' ) : null;
    var authRefDrag = null;
    var authRefJustDragged = false;

    authRefButtons.forEach(function (button) {
      button.addEventListener('click', function ( event ) {
        if ( authRefJustDragged ) {
          event.preventDefault();
          return;
        }
        var target = button.getAttribute('data-lumea-auth-ref-open');
        setAuthRefState( target );
      });
    });

    /* Let the switch thumb be dragged like a native iOS toggle: it follows
       the finger 1:1 while pressed, and snaps to whichever side it's
       released closer to. */
    if ( authRefSwitch && authRefSwitchThumb ) {
      authRefSwitch.addEventListener( 'pointerdown', function ( event ) {
        if ( event.pointerType === 'mouse' && event.button !== 0 ) return;
        authRefDrag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          maxOffset: authRefSwitchThumb.getBoundingClientRect().width,
          moved: false,
          startedOnRegister: authRefSwitch.classList.contains( 'is-register' )
        };
        authRefSwitch.classList.add( 'is-dragging' );
        authRefSwitch.setPointerCapture( event.pointerId );
      } );

      authRefSwitch.addEventListener( 'pointermove', function ( event ) {
        if ( ! authRefDrag || event.pointerId !== authRefDrag.pointerId ) return;
        var dx = event.clientX - authRefDrag.startX;
        if ( Math.abs( dx ) > 3 ) authRefDrag.moved = true;

        var base = authRefDrag.startedOnRegister ? authRefDrag.maxOffset : 0;
        var next = Math.max( 0, Math.min( authRefDrag.maxOffset, base + dx ) );
        authRefSwitchThumb.style.transform = 'translateX(' + next + 'px)';
      } );

      function authRefEndDrag( event ) {
        if ( ! authRefDrag || event.pointerId !== authRefDrag.pointerId ) return;
        var drag = authRefDrag;
        authRefDrag = null;
        authRefSwitch.classList.remove( 'is-dragging' );
        authRefSwitchThumb.style.transform = '';

        if ( ! drag.moved ) return;

        authRefJustDragged = true;
        window.setTimeout( function () { authRefJustDragged = false; }, 80 );

        var dx = event.clientX - drag.startX;
        var base = drag.startedOnRegister ? drag.maxOffset : 0;
        var next = Math.max( 0, Math.min( drag.maxOffset, base + dx ) );
        var showRegister = next > drag.maxOffset / 2;

        setAuthRefState( showRegister ? 'register' : 'login' );
      }

      authRefSwitch.addEventListener( 'pointerup', authRefEndDrag );
      authRefSwitch.addEventListener( 'pointercancel', function ( event ) {
        if ( ! authRefDrag || event.pointerId !== authRefDrag.pointerId ) return;
        authRefDrag = null;
        authRefSwitch.classList.remove( 'is-dragging' );
        authRefSwitchThumb.style.transform = '';
      } );
    }
  }

  /* Password visibility toggle */
  var passwordToggleButtons = document.querySelectorAll('[data-lumea-password-toggle]');

  if (passwordToggleButtons.length) {
    passwordToggleButtons.forEach(function (button) {
      var inputId = button.getAttribute('aria-controls');
      var input = inputId ? document.getElementById(inputId) : null;

      if (!input) {
        return;
      }

      button.addEventListener('click', function () {
        var shouldReveal = input.type === 'password';
        var showLabel = button.getAttribute('data-label-show') || 'Show password';
        var hideLabel = button.getAttribute('data-label-hide') || 'Hide password';

        input.type = shouldReveal ? 'text' : 'password';
        button.setAttribute('aria-pressed', shouldReveal ? 'true' : 'false');
        button.setAttribute('aria-label', shouldReveal ? hideLabel : showLabel);
      });
    });
  }

  /* Cart Drawer */
  var drawer = document.querySelector('[data-lumea-cart-drawer]');
  var overlay = document.querySelector('[data-lumea-cart-overlay]');
  var cartTriggers = document.querySelectorAll('[data-lumea-cart-trigger]');
  var cartCloses = document.querySelectorAll('[data-lumea-cart-close]');

  var lastCartTrigger = null;
  function openCartDrawer() {
    if (!drawer || !overlay) {
      return;
    }
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.removeAttribute('inert');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var firstFocusable = drawer.querySelector('button, a, input, [tabindex]');
    if (firstFocusable) { window.setTimeout(function () { firstFocusable.focus(); }, 50); }
  }

  function closeCartDrawer() {
    if (!drawer || !overlay) {
      return;
    }
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastCartTrigger) { lastCartTrigger.focus(); lastCartTrigger = null; }
  }

  if (drawer && overlay) {
    cartTriggers.forEach(function (btn) {
      btn.addEventListener('click', function () { lastCartTrigger = btn; openCartDrawer(); });
    });

    cartCloses.forEach(function (btn) {
      btn.addEventListener('click', closeCartDrawer);
    });

    overlay.addEventListener('click', closeCartDrawer);

    document.body.addEventListener('added_to_cart', function (event) {
      var detail = event.detail || {};
      handleAddedToCart(detail.fragments || {}, detail.button || null);
    });

    if (window.jQuery) {
      window.jQuery(document.body).on('added_to_cart', function (event, fragments, cartHash, button) {
        handleAddedToCart(fragments || {}, button || null);
      });
    }
  }

  /* Swap each fragment selector in the DOM with the server-rendered HTML. */
  function applyFragments(fragments) {
    if (!fragments || typeof fragments !== 'object') {
      return;
    }

    Object.keys(fragments).forEach(function (selector) {
      var element = document.querySelector(selector);
      if (!element) {
        return;
      }

      var fragment = parseMarkup(fragments[selector]);
      if (fragment.firstChild) {
        element.parentNode.replaceChild(fragment.firstChild, element);
      }
    });
  }

  /* Sync all on-page product card steppers for a product to the given qty. */
  function syncPageCards(productId, newQty) {
    document.querySelectorAll('[data-lumea-qty]').forEach(function (stepper) {
      if (stepper.closest('.lumea-drawer-item')) {
        return;
      }

      var plus = stepper.querySelector('.lumea-qty-plus');
      if (!plus || plus.getAttribute('data-product_id') !== String(productId)) {
        return;
      }

      var quantityText = stepper.querySelector('.lumea-qty-num');
      var atcWrap = stepper.closest('.lumea-card-atc-wrap');
      var cartLink = atcWrap && atcWrap.closest('.lumea-card-actions') && atcWrap.closest('.lumea-card-actions').querySelector('[data-lumea-view-cart]');

      if (newQty <= 0) {
        quantityText.textContent = '1';
        if (atcWrap) {
          atcWrap.classList.remove('is-added');
        }
        if (cartLink) {
          cartLink.classList.remove('is-active');
        }
        return;
      }

      quantityText.textContent = String(newQty);
      if (atcWrap) {
        atcWrap.classList.add('is-added');
      }
      if (cartLink) {
        cartLink.classList.add('is-active');
      }
    });
  }

  function getAddToCartButtonNode(button) {
    if (!button) {
      return null;
    }

    if (button.jquery && button.length) {
      return button.get(0);
    }

    return button.nodeType ? button : null;
  }

  function handleAddedToCart(fragments, button) {
    applyFragments(fragments || {});

    var buttonNode = getAddToCartButtonNode(button);
    var productId = buttonNode ? toPositiveInt(buttonNode.getAttribute('data-product_id')) : 0;
    var quantity = buttonNode ? toPositiveInt(buttonNode.getAttribute('data-quantity')) : 1;

    if (productId) {
      syncPageCards(productId, quantity || 1);
    }
  }

  /* POST qty change; calls done(true|false) when the request settles. */
  function updateCartQty(productId, quantity, done) {
    if (typeof window.lumeaData === 'undefined') {
      done(false);
      return;
    }

    fetch(window.lumeaData.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'action=lumea_update_cart_qty&nonce=' + encodeURIComponent(window.lumeaData.cartNonce) + '&product_id=' + encodeURIComponent(productId) + '&quantity=' + encodeURIComponent(quantity)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (data && data.success) {
          applyFragments(data.data && data.data.fragments ? data.data.fragments : {});
          done(true, data.data || {});
          return;
        }
        done(false);
      })
      .catch(function () {
        done(false);
      });
  }

  function setStepperVisual(quantityNode, atcWrap, cartLink, quantity) {
    if (quantity <= 0) {
      quantityNode.textContent = '1';
      if (atcWrap) {
        atcWrap.classList.remove('is-added');
      }
      if (cartLink) {
        cartLink.classList.remove('is-active');
      }
      return;
    }

    quantityNode.textContent = String(quantity);
    if (atcWrap) {
      atcWrap.classList.add('is-added');
    }
    if (cartLink) {
      cartLink.classList.add('is-active');
    }
  }

  function sendStepperQuantity(stepper, productId, quantityNode, atcWrap, cartLink, quantity, fallbackQuantity) {
    stepper.dataset.busy = '1';
    stepper.dataset.sentQty = String(quantity);

    updateCartQty(productId, quantity, function (ok, data) {
      var pendingQuantity = stepper.dataset.pendingQty;
      delete stepper.dataset.busy;
      delete stepper.dataset.sentQty;

      if (ok) {
        var serverQuantity = data && typeof data.quantity !== 'undefined'
          ? parseInt(data.quantity, 10)
          : quantity;

        if (!Number.isFinite(serverQuantity)) {
          serverQuantity = quantity;
        }

        setStepperVisual(quantityNode, atcWrap, cartLink, serverQuantity);
        syncPageCards(productId, serverQuantity);
      }

      if (typeof pendingQuantity !== 'undefined' && pendingQuantity !== String(quantity)) {
        delete stepper.dataset.pendingQty;
        sendStepperQuantity(
          stepper,
          productId,
          quantityNode,
          atcWrap,
          cartLink,
          parseInt(pendingQuantity, 10) || 0,
          ok ? quantity : fallbackQuantity
        );
        return;
      }

      delete stepper.dataset.pendingQty;

      if (!ok) {
        setStepperVisual(quantityNode, atcWrap, cartLink, fallbackQuantity);
      }
    });
  }

  document.addEventListener('click', function (event) {
    var wishButton = event.target.closest('[data-lumea-wish], [data-wishlist-toggle]');
    if (wishButton) {
      event.preventDefault();
      var wishProductId = getWishlistButtonProductId(wishButton);
      if (wishProductId) {
        toggleWishlistById(wishProductId);
      }
      return;
    }

    var removeButton = event.target.closest('[data-lumea-wishlist-remove]');
    if (removeButton) {
      event.preventDefault();
      var removeId = toPositiveInt(removeButton.getAttribute('data-lumea-wishlist-remove'));

      var pageItem = removeButton.closest('.lumea-wishlist-page-item');
      if (pageItem) {
        var itemH   = pageItem.offsetHeight;
        var gapPx   = parseFloat(getComputedStyle(pageItem.parentElement).rowGap) || 0;
        pageItem.style.overflow = 'hidden';
        pageItem.animate(
          [
            { opacity: '1', transform: 'translateX(0)',        height: (itemH + gapPx) + 'px' },
            { opacity: '0', transform: 'translateX(1.5rem)',   height: '0px' }
          ],
          { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
        ).finished.then(function () {
          pageItem.remove();
          var newIds = getWishlistIds().filter(function (id) { return id !== removeId; });
          setWishlistIds(newIds);
          syncWishlistButtons();
          updateWishlistCountBadge();
          setWishlistCountText(newIds.length);
          var pageList  = document.querySelector('[data-lumea-wishlist-page-items]');
          var pageEmpty = document.querySelector('[data-lumea-wishlist-page-empty]');
          if (pageList && !pageList.querySelector('.lumea-wishlist-page-item')) {
            pageList.replaceChildren();
            if (pageEmpty) { pageEmpty.hidden = false; }
            revealWishlistBelow();
          }
        });
        return;
      }

      removeFromWishlist(removeId);
      return;
    }

    var drawerRemoveButton = event.target.closest('.lumea-drawer-item-remove[data-product_id]');
    if (drawerRemoveButton) {
      event.preventDefault();

      var removeProductId = toPositiveInt(drawerRemoveButton.getAttribute('data-product_id'));
      if (!removeProductId) {
        return;
      }

      if (drawerRemoveButton.dataset.busy) {
        return;
      }
      drawerRemoveButton.dataset.busy = '1';

      updateCartQty(removeProductId, 0, function (ok) {
        delete drawerRemoveButton.dataset.busy;

        if (ok) {
          syncPageCards(removeProductId, 0);
          openCartDrawer();
          return;
        }

        var fallbackUrl = drawerRemoveButton.getAttribute('href');
        if (fallbackUrl) {
          window.location.href = fallbackUrl;
        }
      });
      return;
    }

    var addToCartButton = event.target.closest('.lumea-card-atc-wrap .add_to_cart_button');
    if (addToCartButton) {
      var addWrap = addToCartButton.closest('.lumea-card-atc-wrap');
      var addCartLink = addToCartButton.closest('.lumea-card-actions') && addToCartButton.closest('.lumea-card-actions').querySelector('[data-lumea-view-cart]');
      if (addWrap) {
        addWrap.classList.add('is-added');
      }
      if (addCartLink) {
        addCartLink.classList.add('is-active');
      }
      return;
    }

    var stepperButton = event.target.closest('.lumea-qty-plus, .lumea-qty-minus');
    if (!stepperButton) {
      return;
    }

    var stepper = stepperButton.closest('[data-lumea-qty]');
    if (!stepper) {
      return;
    }

    var isPlus = stepperButton.classList.contains('lumea-qty-plus');
    var quantityNode = stepper.querySelector('.lumea-qty-num');
    var plusButton = stepper.querySelector('.lumea-qty-plus');
    var productId = plusButton && plusButton.getAttribute('data-product_id');

    if (!productId || !quantityNode) {
      return;
    }

    var currentQuantity = parseInt(quantityNode.textContent, 10) || 1;
    var newQuantity = isPlus ? currentQuantity + 1 : currentQuantity - 1;
    var atcWrap = stepper.closest('.lumea-card-atc-wrap');
    var cartLink = atcWrap && atcWrap.closest('.lumea-card-actions') && atcWrap.closest('.lumea-card-actions').querySelector('[data-lumea-view-cart]');

    setStepperVisual(quantityNode, atcWrap, cartLink, newQuantity);

    if (stepper.dataset.busy === '1') {
      stepper.dataset.pendingQty = String(newQuantity);
      return;
    }

    sendStepperQuantity(stepper, productId, quantityNode, atcWrap, cartLink, newQuantity, currentQuantity);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }

    closeCartDrawer();
    closeSearchOverlay();
    closeAccountDropdown();

    if (mobileNav && navToggle && mobileNav.classList.contains('is-open')) {
      mobileNav.classList.remove('is-open');
      navToggle.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
      mobileNav.setAttribute('inert', '');
      document.body.style.overflow = '';
      navToggle.focus();
    }
  });

  /* Shop filter dropdowns — event delegation survives AJAX DOM replacement */
  function lumeaCloseAllDropdowns() {
    document.querySelectorAll('[data-lumea-dropdown]').forEach(function (d) {
      d.classList.remove('is-open');
      var t = d.querySelector('[data-lumea-dropdown-trigger]');
      if (t) { t.setAttribute('aria-expanded', 'false'); }
    });
  }
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-lumea-dropdown-trigger]');
    if (trigger) {
      e.stopPropagation();
      var dd      = trigger.closest('[data-lumea-dropdown]');
      var wasOpen = dd && dd.classList.contains('is-open');
      lumeaCloseAllDropdowns();
      if (dd && !wasOpen) {
        dd.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
      return;
    }
    if (!e.target.closest('[data-lumea-dropdown]')) {
      lumeaCloseAllDropdowns();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { lumeaCloseAllDropdowns(); }
  });

  /* Shop AJAX filtering */
  var shopBody  = document.querySelector('.lumea-shop-body');
  var filterBar = document.getElementById('lumeaFilterBar');

  if (shopBody && filterBar) {
    var fetchCtrl = null;

    function lumeaShopFetch(url, isPop, scrollTop) {
      if (fetchCtrl) { fetchCtrl.abort(); }
      fetchCtrl = window.AbortController ? new AbortController() : null;

      shopBody.classList.add('is-loading');
      shopBody.setAttribute('aria-busy', 'true');

      var opts = { headers: { 'X-Requested-With': 'XMLHttpRequest' } };
      if (fetchCtrl) { opts.signal = fetchCtrl.signal; }

      fetch(url, opts)
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var nb  = doc.querySelector('.lumea-shop-body');
          var nf  = doc.querySelector('#lumeaFilterBar');

          if (nb) { replaceChildrenFromNode(shopBody, nb); }
          if (nf) { replaceChildrenFromNode(filterBar, nf); }

          if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
            var newFade   = Array.prototype.slice.call(shopBody.querySelectorAll('.lumea-reveal--fade-js'));
            var newStatic = Array.prototype.slice.call(shopBody.querySelectorAll('.lumea-reveal--static-js:not(.lumea-reveal--fade-js)'));
            if (newFade.length)   gsap.set(newFade,   { y: 30, autoAlpha: 0 });
            if (newStatic.length) gsap.set(newStatic, { autoAlpha: 0 });
            var newReveals = Array.prototype.slice.call(shopBody.querySelectorAll('.lumea-reveal-js'));
            if (newReveals.length) {
              ScrollTrigger.batch(newReveals, {
                start:   'top bottom-=50',
                once:    true,
                onEnter: function (batch) {
                  gsap.to(batch, { autoAlpha: 1, y: 0, x: 0, duration: 0.7, ease: 'power1.out', stagger: 0.1 });
                },
              });
              ScrollTrigger.refresh();
            }
          }

          if (!isPop) { history.pushState({ lumea: 1 }, '', url); }

          if (scrollTop) {
            shopBody.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }

          fetchCtrl = null;
          shopBody.classList.remove('is-loading');
          shopBody.setAttribute('aria-busy', 'false');
        })
        .catch(function (err) {
          if (err.name !== 'AbortError') {
            shopBody.classList.remove('is-loading');
            shopBody.setAttribute('aria-busy', 'false');
          }
          fetchCtrl = null;
        });
    }

    filterBar.addEventListener('click', function (e) {
      var link = e.target.closest('a.lumea-filter-option, a.lumea-filter-pill, a.lumea-active-tag, a.lumea-clear-filters');
      if (!link) { return; }
      e.preventDefault();
      lumeaShopFetch(link.href, false, false);
    });

    shopBody.addEventListener('click', function (e) {
      var link = e.target.closest('.lumea-shop-pagination a');
      if (!link) { return; }
      e.preventDefault();
      lumeaShopFetch(link.href, false, true);
    });

    window.addEventListener('popstate', function () {
      lumeaShopFetch(location.href, true, false);
    });
  }

  var checkoutRight = document.querySelector('.lumea-checkout-right');
  var checkoutRightUpdateToken = 0;

  function lumeaCheckoutRightReady() {
    var right = document.querySelector('.lumea-checkout-right');
    if (!right) { return; }

    right.querySelectorAll('.blockUI').forEach(function (node) {
      node.remove();
    });
    right.querySelectorAll('.processing').forEach(function (node) {
      node.classList.remove('processing');
    });
  }

  function lumeaCheckoutRightSoftBlock() {
    var right = document.querySelector('.lumea-checkout-right');
    if (!right) { return; }

    right.querySelectorAll('.blockUI.blockOverlay').forEach(function (overlay) {
      overlay.style.opacity = '0.16';
      overlay.style.background = 'rgba(255, 255, 255, 0.72)';
      overlay.style.borderRadius = '1rem';
    });
  }

  if (checkoutRight) {
    window.addEventListener('pageshow', function () {
      window.requestAnimationFrame(lumeaCheckoutRightReady);
    });

    if ('MutationObserver' in window) {
      new MutationObserver(lumeaCheckoutRightSoftBlock).observe(checkoutRight, {
        childList: true,
        subtree: true
      });
    }

    if (window.jQuery) {
      window.jQuery(document.body).on('update_checkout', function () {
        checkoutRightUpdateToken += 1;
        setTimeout(lumeaCheckoutRightSoftBlock, 20);
        setTimeout(lumeaCheckoutRightSoftBlock, 120);
      });

      window.jQuery(document.body).on('updated_checkout checkout_error', function () {
        var token = checkoutRightUpdateToken;
        window.requestAnimationFrame(function () {
          if (token === checkoutRightUpdateToken) {
            lumeaCheckoutRightReady();
          }
        });
        setTimeout(function () {
          if (token === checkoutRightUpdateToken) {
            lumeaCheckoutRightReady();
          }
        }, 120);
      });
    }
  }

  window.addEventListener('storage', function (event) {
    if (event.key === WISHLIST_STORAGE_KEY) {
      refreshWishlistUI();
    }
  });

  refreshWishlistUI();

  /* ── Search page: filter tabs ── */
  var searchFilters   = document.querySelector('[data-lumea-search-filters]');
  var searchGrid      = document.querySelector('[data-lumea-search-grid]');
  var searchPagination = document.querySelector('[data-lumea-search-pagination]');

  if (searchFilters && searchGrid) {
    searchFilters.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-filter]');
      if (!tab) return;

      var filter = tab.getAttribute('data-filter');

      searchFilters.querySelectorAll('[data-filter]').forEach(function (t) {
        t.classList.toggle('is-active', t === tab);
      });

      var allCards = searchGrid.querySelectorAll('[data-post-type]');
      var visibleCount = 0;

      allCards.forEach(function (card) {
        var matches = filter === 'all' || card.getAttribute('data-post-type') === filter;
        if (matches) {
          card.removeAttribute('data-hidden');
          visibleCount++;
        } else {
          card.setAttribute('data-hidden', '');
        }
      });

      if (searchPagination) {
        searchPagination.style.display = filter === 'all' ? '' : 'none';
      }
    });
  }
})();

/* Warm product-card hover images on hover-capable devices so the
   hover reveal never waits on a lazy network fetch (lazy images that
   are visually hidden are deferred by the browser until too late). */
(function () {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  function warmHoverImages() {
    document.querySelectorAll(".lumea-lp-img--hover, .lumea-best-img--hover").forEach(function (img) {
      if (img.getAttribute("loading") === "lazy") img.loading = "eager";
      if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
    });
  }

  if (document.readyState === "complete") {
    setTimeout(warmHoverImages, 300);
  } else {
    window.addEventListener("load", function () { setTimeout(warmHoverImages, 300); });
  }

  // cards injected later (e.g. AJAX shop filtering): warm on first approach
  document.addEventListener("pointerover", function (e) {
    var media = e.target.closest ? e.target.closest(".lumea-lp-media, .lumea-best-media") : null;
    if (!media) return;
    var img = media.querySelector(".lumea-lp-img--hover, .lumea-best-img--hover");
    if (img && img.getAttribute("loading") === "lazy") img.loading = "eager";
  });
})();

/* Touch devices: keep the product-card slider dots in sync with the
   swiped image (scroll events don\x27t bubble, so listen in capture). */
(function () {
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  document.addEventListener("scroll", function (e) {
    var track = e.target;
    if (!track.classList || !track.classList.contains("lumea-lp-track")) return;
    var media = track.closest(".lumea-lp-media");
    if (!media) return;
    var dots = media.querySelectorAll(".lumea-lp-dot");
    if (!dots.length) return;
    var index = Math.round(track.scrollLeft / track.clientWidth);
    dots.forEach(function (dot, i) {
      dot.classList.toggle("is-active", i === index);
    });
  }, true);
})();

/* ===== animations.js ===== */
( function () {
  'use strict';

  if ( typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' ) return;

  var standardHeroParts = [
    '.lumea-page-hero-label',
    '.lumea-page-hero-reveal-js',
    '.lumea-page-hero-sub',
    '.lumea-page-hero-cta',
    '.lumea-shop-hero-eyebrow',
    '.lumea-shop-hero-title',
    '.lumea-shop-hero-desc',
    '.lumea-policy-hero .lumea-cart-eyebrow',
    '.lumea-policy-hero-title',
    '.lumea-policy-hero-sub',
    '.lumea-search-eyebrow',
    '.lumea-search-title',
    '.lumea-search-form'
  ].join( ', ' );

  if ( window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) {
    document.querySelectorAll(
      '.lumea-header-logo, .lumea-nav-list li, .lumea-header-actions > *, ' +
      '.hero-title, .hero-label, .subtitles span, .cta-wrap, .lumea-reveal-js, ' + standardHeroParts
    ).forEach( function ( el ) { el.style.visibility = 'visible'; el.style.opacity = '1'; } );
    return;
  }

  gsap.registerPlugin( ScrollTrigger );
  if ( typeof SplitText !== 'undefined' ) gsap.registerPlugin( SplitText );

  
  var utilityRevealRoots = '.lumea-cart-page, .lumea-checkout-page, .lumea-thankyou-page, .lumea-account-page, .lumea-login-page';

  function isUtilityReveal( el ) {
    return !! el.closest( utilityRevealRoots );
  }

  function excludeUtilityReveal( el ) {
    return ! isUtilityReveal( el );
  }

  if ( typeof SplitText !== 'undefined' ) {
    document.querySelectorAll( '.lumea-split-js' ).forEach( function ( el ) {
      if ( el.classList.contains( 'lumea-split--chars-js' ) ) {
        new SplitText( el, {
          type:       'chars,lines',
          linesClass: 'lumea-st-line',
          charsClass: 'lumea-st-char',
          aria:       'none',
        } );
      } else {
        new SplitText( el, {
          type:       'lines',
          linesClass: 'lumea-st-line',
          aria:       'none',
        } );
      }
    } );
  }

  

  var _fade   = gsap.utils.toArray( '.lumea-reveal--fade-js' ).filter( excludeUtilityReveal );
  var _static = gsap.utils.toArray( '.lumea-reveal--static-js' ).filter( excludeUtilityReveal );
  var _right  = gsap.utils.toArray( '.lumea-reveal--right-js' ).filter( excludeUtilityReveal );
  var _left   = gsap.utils.toArray( '.lumea-reveal--left-js' ).filter( excludeUtilityReveal );
  var _lines  = gsap.utils.toArray( '.lumea-reveal--text-js.lumea-split--lines-js .lumea-st-line' ).filter( excludeUtilityReveal );
  var _chars  = gsap.utils.toArray( '.lumea-reveal--text-js.lumea-split--chars-js .lumea-st-char' ).filter( excludeUtilityReveal );

  if ( _fade.length   ) gsap.set( _fade,   { y: 30,     autoAlpha: 0 } );
  if ( _static.length ) gsap.set( _static, {             autoAlpha: 0 } );
  if ( _right.length  ) gsap.set( _right,  { x: '15%',  autoAlpha: 0 } );
  if ( _left.length   ) gsap.set( _left,   { x: '-15%', autoAlpha: 0 } );
  if ( _lines.length  ) gsap.set( _lines,  { y: 30,     autoAlpha: 0 } );
  if ( _chars.length  ) gsap.set( _chars,  {             autoAlpha: 0 } );

  

  function animateDef( el, index, isStatic ) {
    var ease  = 'power1.out';
    var delay = index * 0.1 + ( parseFloat( el.dataset.lumeaDelay ) || 0 );
    if ( ! isStatic ) {
      gsap.to( el, { x: 0, y: 0, duration: 0.7, ease: ease, delay: delay } );
    }
    gsap.to( el, { autoAlpha: 1, duration: 0.5, ease: ease, delay: delay + 0.1 } );
  }

  

  function animateBatch( batch ) {
    batch.forEach( function ( el, index ) {

      
      if ( el.classList.contains( 'lumea-reveal--clip-js' ) ) {
        gsap.fromTo( el,
          { '--mustard-clip': '100%' },
          {
            '--mustard-clip': '0%',
            duration:       1.1,
            ease:           'power3.out',
            delay:          index * 0.2,
            onComplete:     function () { el.classList.add( 'lumea-clip-done' ); },
          }
        );
        return;
      }

      
      if ( el.classList.contains( 'lumea-reveal--text-js' ) ) {
        var chars = el.querySelectorAll( '.lumea-st-char' );
        var lines = el.querySelectorAll( '.lumea-st-line' );
        var delay = index * 0.1;

        if ( chars.length ) {
          gsap.to( chars, {
            autoAlpha: 1,
            duration:  0.4,
            ease:      'power3.inOut',
            stagger:   0.05,
            delay:     delay,
          } );
        } else if ( lines.length ) {
          gsap.to( lines, {
            y:        0,
            duration: 0.6,
            ease:     'power1.out',
            stagger:  0.15,
            delay:    delay,
          } );
          gsap.to( lines, {
            autoAlpha: 1,
            duration:  0.5,
            ease:      'power1.out',
            stagger:   0.15,
            delay:     delay + 0.1,
          } );
        } else {
          animateDef( el, index, false );
        }
        return;
      }

      
      if ( el.classList.contains( 'lumea-reveal--static-js' ) ) {
        animateDef( el, index, true );
        return;
      }

      

      animateDef( el, index, false );
    } );
  }

  function getRevealHeroGate( el ) {
    var heroRoots = '.lumea-shop-hero, .lumea-page-hero, .lumea-policy-hero, .lumea-search-hero';
    var page = el.closest( '#lumeaPage' );
    var hero = page ? page.querySelector( heroRoots ) : null;
    if ( ! hero || hero.contains( el ) ) return null;
    return hero;
  }

  function getHeroGateWait( hero ) {
    var timeline = hero && hero.lumeaHeroTimeline;
    var mobileRevealAt = window.matchMedia( '(max-width: 767px)' ).matches ? 0.38 : 0.72;
    var revealAt = parseFloat( hero && hero.dataset.lumeaRevealGateAt ) || mobileRevealAt;
    if ( ! timeline ) return 0;
    return Math.max( 0, revealAt - timeline.time() );
  }

  function animateBatchAfterHero( batch, attempt ) {
    var immediate = [];
    var gated = [];
    var needsRetry = false;
    var wait = 0;

    batch.forEach( function ( el ) {
      var hero = getRevealHeroGate( el );
      if ( ! hero ) {
        immediate.push( el );
        return;
      }

      gated.push( el );

      if ( ! hero.lumeaHeroTimeline && ! hero.dataset.lumeaStandardHeroReady ) {
        needsRetry = true;
        return;
      }

      wait = Math.max( wait, getHeroGateWait( hero ) );
    } );

    if ( immediate.length ) animateBatch( immediate );
    if ( ! gated.length ) return;

    if ( needsRetry && ( attempt || 0 ) < 10 ) {
      window.requestAnimationFrame( function () {
        animateBatchAfterHero( gated, ( attempt || 0 ) + 1 );
      } );
      return;
    }

    if ( wait > 0.08 ) {
      gsap.delayedCall( wait, function () {
        animateBatch( gated );
      } );
      return;
    }

    animateBatch( gated );
  }

  

  var revealTargets = gsap.utils.toArray( '.lumea-reveal-js:not(.lumea-reveal--hero-js)' ).filter( excludeUtilityReveal );

  if ( revealTargets.length ) {
    ScrollTrigger.batch( revealTargets, {
      start:   'top bottom-=50',
      once:    true,
      onEnter: animateBatchAfterHero,
    } );
  }

  ScrollTrigger.batch( '.lumea-reveal--hero-js', {
    start:   'top bottom',
    once:    true,
    onEnter: animateBatch,
  } );

  

  document.querySelectorAll( '.lumea-parallax-js' ).forEach( function ( el ) {
    var value = parseFloat( el.dataset.parallaxValue        ) || 15;
    var scrub = parseFloat( el.dataset.parallaxScrub        ) || 1;
    var start =             el.dataset.parallaxTriggerStart   || 'top bottom';
    var end   =             el.dataset.parallaxTriggerEnd     || 'bottom top';
    var isRev = el.classList.contains( 'lumea-parallax--reverse-js' );

    var trig = { trigger: el, start: start, end: end, scrub: scrub };

    if ( el.classList.contains( 'lumea-parallax--img-js' ) ) {
      el.style.height = 'calc(100% + ' + value + '%)';
      el.style.top    = '-' + ( value / 2 ) + '%';
      gsap.to( el, { yPercent: isRev ? value : -value, ease: 'none', scrollTrigger: trig } );

    } else if ( el.classList.contains( 'lumea-parallax--x-js' ) ) {
      gsap.to( el, { xPercent: isRev ? -value : value, ease: 'none', scrollTrigger: trig } );

    } else if ( el.classList.contains( 'lumea-parallax--scale-js' ) ) {
      gsap.to( el, { scale: 1 + value / 100, ease: 'none', scrollTrigger: trig } );

    } else {
      gsap.to( el, { yPercent: isRev ? -value : value, ease: 'none', scrollTrigger: trig } );
    }
  } );

  

  document.querySelectorAll( '.lumea-parallax-wrap-js' ).forEach( function ( wrap ) {
    var img = wrap.querySelector( '.lumea-parallax--hero-js' );
    if ( ! img ) return;
    var value = parseFloat( img.dataset.parallaxValue ) || 20;

    gsap.to( img, {
      yPercent:      value,
      ease:          'none',
      scrollTrigger: { trigger: wrap, start: 'top top', end: 'bottom top', scrub: true },
    } );
  } );

  

  ( function initIntroAnim() {

    

    if ( window.wp && window.wp.customize ) return;

    var header    = document.querySelector( '.lumea-header' );
    if ( ! header ) return;

    var logo      = document.querySelector( '.lumea-header-logo' );
    var navItems  = document.querySelectorAll( '.lumea-nav-list li' );
    var actions   = document.querySelectorAll( '.lumea-header-actions > *' );
    var hero      = document.querySelector( '.hero' );
    var heroTitle = document.querySelector( '.hero-title' );
    var heroLabel = document.querySelector( '.hero-label' );
    var subtitles = document.querySelectorAll( '.subtitles span' );
    var ctaWrap   = document.querySelector( '.cta-wrap' );

    
    var naturalLS = ( hero && heroTitle )
      ? window.getComputedStyle( heroTitle ).letterSpacing
      : '0px';

    
    if ( logo        ) gsap.set( logo,     { autoAlpha: 0 } );
    if ( navItems.length ) gsap.set( navItems, { autoAlpha: 0 } );
    if ( actions.length  ) gsap.set( actions,  { autoAlpha: 0 } );

    if ( hero ) {
      if ( heroTitle ) {
        gsap.set( heroTitle, {
          letterSpacing:   '0.28em',
          scale:           1.03,
          autoAlpha:       0,
          transformOrigin: 'left center',
        } );
      }
      if ( heroLabel ) {
        gsap.set( heroLabel, { clipPath: 'inset(0% 0% 0% 100%)', autoAlpha: 0 } );
      }
      if ( subtitles.length ) {
        gsap.set( subtitles, { clipPath: 'inset(0% 100% 0% 0%)', autoAlpha: 0 } );
      }
      if ( ctaWrap ) {
        gsap.set( ctaWrap, { autoAlpha: 0 } );
      }
    }

    
    var tl = gsap.timeline( { delay: 0.05, defaults: { ease: 'power3.out' } } );

    if ( logo ) {
      tl.to( logo, { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, 0.1 );
    }
    if ( navItems.length ) {
      tl.to( navItems, { autoAlpha: 1, duration: 0.35, ease: 'power2.out', stagger: 0.04 }, 0.15 );
    }
    if ( actions.length ) {
      tl.to( actions, { autoAlpha: 1, duration: 0.3, ease: 'power2.out', stagger: 0.03 }, 0.18 );
    }

    if ( ! hero ) return;

    
    if ( heroTitle ) {
      tl.to( heroTitle, {
        letterSpacing: naturalLS,
        scale:         1,
        autoAlpha:     1,
        duration:      2.4,
        ease:          'power3.inOut',
        onComplete: function () {
          gsap.set( heroTitle, { clearProps: 'letterSpacing,scale,transform' } );
        },
      }, 0.06 );
    }

    
    if ( heroLabel ) {
      tl.to( heroLabel, {
        clipPath:  'inset(0% 0% 0% 0%)',
        autoAlpha: 1,
        duration:  1.0,
        ease:      'power4.out',
        onComplete: function () {
          gsap.set( heroLabel, { clearProps: 'clipPath' } );
        },
      }, 1.05 );
    }

    
    if ( subtitles.length ) {
      tl.to( subtitles, {
        clipPath:  'inset(0% 0% 0% 0%)',
        autoAlpha: 1,
        duration:  0.8,
        stagger:   0.14,
        ease:      'power4.out',
        onComplete: function () {
          gsap.set( '.subtitles span', { clearProps: 'clipPath' } );
        },
      }, 1.2 );
    }

    
    if ( ctaWrap ) {
      tl.to( ctaWrap, { autoAlpha: 1, duration: 1.0, ease: 'power2.out' }, 1.55 );
    }

  } )();

  

  ( function initCuratedMosaicReveal() {

    var section = document.querySelector( '.lumea-curated' );
    if ( ! section ) return;

    var tiles_count = 24;
    var productTiles = section.querySelectorAll( '.lumea-product-tile' );
    if ( ! productTiles.length ) return;

    
    productTiles.forEach( function ( tile ) {
      var grid = document.createElement( 'div' );
      grid.className = 'lumea-mosaic-grid';
      for ( var i = 0; i < tiles_count; i++ ) {
        var span = document.createElement( 'span' );
        span.className = 'lumea-mosaic-tile';
        grid.appendChild( span );
      }
      tile.appendChild( grid );
    } );

    
    var productImgs = section.querySelectorAll( '.lumea-product-image' );
    gsap.set( productImgs, { scale: 1.18, filter: 'blur(8px)' } );

    
    productTiles.forEach( function ( tile, index ) {
      var mosaic = tile.querySelector( '.lumea-mosaic-grid' );
      var tiles  = mosaic.querySelectorAll( '.lumea-mosaic-tile' );
      var img    = tile.querySelector( '.lumea-product-image' );
      var delay  = index * 0.55;

      ScrollTrigger.create( {
        trigger: tile,
        start:   'top 80%',
        once:    true,
        onEnter: function () {

          
          gsap.to( tiles, {
            opacity:  0,
            scale:    0.4,
            rotate:   function () { return gsap.utils.random( -18, 18 ); },
            yPercent: function () { return gsap.utils.random( -80, 80 ); },
            xPercent: function () { return gsap.utils.random( -80, 80 ); },
            duration: 0.9,
            ease:     'power4.inOut',
            delay:    delay,
            stagger:  { amount: 0.65, from: 'random' },
            onComplete: function () { gsap.set( mosaic, { display: 'none' } ); },
          } );

          
          gsap.to( img, {
            scale:    1,
            filter:   'blur(0px)',
            duration: 1.35,
            ease:     'power4.out',
            delay:    delay,
          } );

        },
      } );
    } );

  } )();

  


  ( function initSectionIntroReveal() {

    var hasSplit = typeof SplitText !== 'undefined';

    document.querySelectorAll( '.lumea-section-intro-js' ).forEach( function ( intro ) {
      var eyebrow = intro.querySelector( '.lumea-eyebrow' );
      var title   = intro.querySelector( '.lumea-section-title' );
      var desc    = intro.querySelector( '.lumea-section-desc' );

      if ( ! title ) return;

      
      var titleTargets;

      if ( hasSplit ) {
        // Split into lines and wrap each in its own mask
        var split = new SplitText( title, { type: 'lines', linesClass: 'lumea-si-line' } );
        split.lines.forEach( function ( line ) {
          var mask = document.createElement( 'div' );
          mask.className = 'lumea-si-mask';
          line.parentNode.insertBefore( mask, line );
          mask.appendChild( line );
        } );
        titleTargets = split.lines;
      } else {
        // No SplitText — wrap the whole title in one mask and reveal as a single unit
        var mask = document.createElement( 'div' );
        mask.className = 'lumea-si-mask';
        title.parentNode.insertBefore( mask, title );
        mask.appendChild( title );
        titleTargets = [ title ];
      }

      // Start below the mask edge — pure positional reveal, no opacity or skew
      gsap.set( titleTargets, { yPercent: 110 } );


      if ( eyebrow ) {
        gsap.set( eyebrow, { autoAlpha: 0, y: 8, filter: 'blur(5px)' } );
      }


      if ( desc ) {
        gsap.set( desc, { autoAlpha: 0 } );
      }


      var tl = gsap.timeline( {
        scrollTrigger: {
          trigger: intro,
          start:   'top 65%',
          once:    true,
        },
        defaults: { ease: 'power4.out' },
      } );


      if ( eyebrow ) {
        tl.to( eyebrow, {
          autoAlpha: 1,
          y:         0,
          filter:    'blur(0px)',
          duration:  0.85,
          ease:      'power3.out',
        }, 0 );
      }

      var titlePos = eyebrow ? 0.18 : 0;

      tl.to( titleTargets, {
        yPercent: 0,
        duration: 1.05,
        stagger:  hasSplit ? 0.12 : 0,
      }, titlePos );

      
      if ( desc ) {
        tl.to( desc, {
          autoAlpha: 1,
          duration:  0.7,
          ease:      'power2.out',
        }, '-=0.55' );
      }

    } );

  } )();

  /* ── Manifesto quote — line-by-line slide-up reveal ── */
  ( function initManifestoLineReveal() {

    var mq   = document.querySelector( '.lumea-about-manifesto-q' );
    var cite = document.querySelector( '.lumea-about-manifesto-cite' );
    if ( ! mq || typeof SplitText === 'undefined' ) return;

    var split = new SplitText( mq, { type: 'lines', linesClass: 'lumea-si-line' } );

    split.lines.forEach( function ( line ) {
      var mask = document.createElement( 'div' );
      mask.className = 'lumea-si-mask';
      line.parentNode.insertBefore( mask, line );
      mask.appendChild( line );
    } );

    gsap.set( split.lines, { yPercent: 110 } );
    if ( cite ) gsap.set( cite, { autoAlpha: 0, y: 8 } );

    ScrollTrigger.create( {
      trigger: mq,
      start:   'top 80%',
      once:    true,
      onEnter: function () {
        var tl = gsap.timeline();
        tl.to( split.lines, {
          yPercent: 0,
          duration: 1.0,
          ease:     'power4.out',
          stagger:  0.16,
        } );
        if ( cite ) {
          tl.to( cite, {
            autoAlpha: 1,
            y:         0,
            duration:  0.6,
            ease:      'power2.out',
          }, '-=0.2' );
        }
      },
    } );

  } )();

  ( function initStandardHeroTimelines() {

    var lumeaHeroTimelineSettings = {
      eyebrowAt:        0,
      titleAt:          0.18,
      titleAtNoEyebrow: 0,
      subtitleOverlap:  '-=0.55',
      actionOverlap:    '-=0.45',
      eyebrowDuration:  0.85,
      titleDuration:    1.05,
      subtitleDuration: 0.7,
      actionDuration:   0.7,
      titleStagger:     0.12,
      titleEase:        'power4.out',
      fadeEase:         'power2.out'
    };

    var standardHeroConfigs = [
      {
        root:     '.lumea-page-hero',
        eyebrow:  '.lumea-page-hero-label',
        title:    '.lumea-page-hero-h1',
        lines:    '.lumea-page-hero-line',
        subtitle: '.lumea-page-hero-sub',
        action:   '.lumea-page-hero-cta'
      },
      {
        root:     '.lumea-shop-hero',
        eyebrow:  '.lumea-shop-hero-eyebrow',
        title:    '.lumea-shop-hero-title',
        subtitle: '.lumea-shop-hero-desc',
        action:   '.lumea-shop-hero-inner > .lumea-btn, .lumea-shop-hero-search'
      },
      {
        root:     '.lumea-policy-hero',
        eyebrow:  '.lumea-cart-eyebrow',
        title:    '.lumea-policy-hero-title',
        subtitle: '.lumea-policy-hero-sub'
      },
      {
        root:    '.lumea-search-hero',
        eyebrow: '.lumea-search-eyebrow',
        title:   '.lumea-search-title',
        action:  '.lumea-search-form'
      }
    ];

    function collectHeroItems( root, selector ) {
      if ( ! selector ) return [];
      return Array.prototype.slice.call( root.querySelectorAll( selector ) );
    }

    function getHeroTitleLines( title, selector ) {
      var lines = selector ? collectHeroItems( title, selector ) : [];
      if ( lines.length ) return lines;

      if ( title.dataset.lumeaHeroTitleWrapped ) {
        return collectHeroItems( title, '.lumea-si-line' );
      }

      if ( typeof SplitText !== 'undefined' ) {
        var split = new SplitText( title, {
          type:       'lines',
          linesClass: 'lumea-si-line',
          aria:       'none'
        } );
        title.dataset.lumeaHeroTitleWrapped = '1';
        return split.lines || collectHeroItems( title, '.lumea-si-line' );
      }

      if ( ! title.dataset.lumeaHeroTitleWrapped ) {
        var text = title.textContent.replace( /\s+/g, ' ' ).trim();
        var words = text ? text.split( ' ' ) : [];
        var wordSpans = [];
        var rows = [];
        var row = [];
        var rowTop = null;

        title.textContent = '';
        words.forEach( function ( word, index ) {
          var wordSpan = document.createElement( 'span' );
          wordSpan.className = 'lumea-standard-hero-word';
          wordSpan.style.display = 'inline-block';
          wordSpan.textContent = word;
          title.appendChild( wordSpan );
          if ( index < words.length - 1 ) title.appendChild( document.createTextNode( ' ' ) );
          wordSpans.push( wordSpan );
        } );

        wordSpans.forEach( function ( wordSpan ) {
          var top = Math.round( wordSpan.getBoundingClientRect().top );
          if ( null === rowTop || Math.abs( top - rowTop ) <= 2 ) {
            row.push( wordSpan.textContent );
          } else {
            rows.push( row );
            row = [ wordSpan.textContent ];
          }
          rowTop = top;
        } );

        if ( row.length ) rows.push( row );

        title.textContent = '';
        if ( rows.length ) {
          rows.forEach( function ( lineWords ) {
            var line = document.createElement( 'span' );
            line.className = 'lumea-si-line';
            line.textContent = lineWords.join( ' ' );
            title.appendChild( line );
          } );
        } else {
          var line = document.createElement( 'span' );
          line.className = 'lumea-si-line';
          line.textContent = text;
          title.appendChild( line );
        }

        title.dataset.lumeaHeroTitleWrapped = '1';
      }

      return collectHeroItems( title, '.lumea-si-line' );
    }

    function maskHeroLines( lines ) {
      lines.forEach( function ( line ) {
        if ( line.parentNode.classList && line.parentNode.classList.contains( 'lumea-si-mask' ) ) return;

        var mask = document.createElement( 'div' );
        mask.className = 'lumea-si-mask';
        line.parentNode.insertBefore( mask, line );
        mask.appendChild( line );
      } );
    }

    function showHeroItems( items ) {
      items.forEach( function ( item ) {
        item.style.visibility = 'visible';
      } );
    }

    function initHero( hero, config ) {
      if ( hero.dataset.lumeaStandardHeroReady ) return;

      var title = hero.querySelector( config.title );
      if ( ! title ) return;

      var lines = getHeroTitleLines( title, config.lines );
      if ( ! lines.length ) return;

      var eyebrows = collectHeroItems( hero, config.eyebrow );
      var subtitles = collectHeroItems( hero, config.subtitle );
      var actions = collectHeroItems( hero, config.action );

      maskHeroLines( lines );
      showHeroItems( [ title ].concat( eyebrows, subtitles, actions ) );

      gsap.set( lines, { yPercent: 110 } );
      if ( eyebrows.length ) gsap.set( eyebrows, { autoAlpha: 0, y: 8, filter: 'blur(5px)' } );
      if ( subtitles.length ) gsap.set( subtitles, { autoAlpha: 0, y: 18 } );
      if ( actions.length ) gsap.set( actions, { autoAlpha: 0, y: 14 } );

      var tl = gsap.timeline();

      if ( eyebrows.length ) {
        tl.to( eyebrows, {
          autoAlpha: 1,
          y:         0,
          filter:    'blur(0px)',
          duration:  lumeaHeroTimelineSettings.eyebrowDuration,
          ease:      lumeaHeroTimelineSettings.fadeEase
        }, lumeaHeroTimelineSettings.eyebrowAt );
      }

      var titleAt = eyebrows.length ? lumeaHeroTimelineSettings.titleAt : lumeaHeroTimelineSettings.titleAtNoEyebrow;

      tl.to( lines, {
        yPercent: 0,
        duration: lumeaHeroTimelineSettings.titleDuration,
        ease:     lumeaHeroTimelineSettings.titleEase,
        stagger:  lumeaHeroTimelineSettings.titleStagger
      }, titleAt );

      if ( subtitles.length ) {
        tl.to( subtitles, {
          autoAlpha: 1,
          y:         0,
          duration:  lumeaHeroTimelineSettings.subtitleDuration,
          ease:      lumeaHeroTimelineSettings.fadeEase
        }, lumeaHeroTimelineSettings.subtitleOverlap );
      }

      if ( actions.length ) {
        tl.to( actions, {
          autoAlpha: 1,
          y:         0,
          duration:  lumeaHeroTimelineSettings.actionDuration,
          ease:      lumeaHeroTimelineSettings.fadeEase
        }, lumeaHeroTimelineSettings.actionOverlap );
      }

      hero.dataset.lumeaStandardHeroReady = '1';
      hero.lumeaHeroTimeline = tl;
    }

    standardHeroConfigs.forEach( function ( config ) {
      document.querySelectorAll( config.root ).forEach( function ( hero ) {
        initHero( hero, config );
      } );
    } );

  } )();


  /* ── About stats — staggered slide-up reveal ── */
  ( function initAboutStatsReveal() {

    var cells = gsap.utils.toArray( '.lumea-about-stat-reveal-js' );
    if ( ! cells.length ) return;

    var inners = cells.map( function ( cell ) {
      var children = Array.prototype.slice.call( cell.childNodes );
      var mask  = document.createElement( 'div' );
      var inner = document.createElement( 'div' );
      mask.className = 'lumea-stat-mask';
      children.forEach( function ( child ) { inner.appendChild( child ); } );
      mask.appendChild( inner );
      cell.appendChild( mask );
      return inner;
    } );

    gsap.set( inners, { yPercent: 110 } );

    ScrollTrigger.create( {
      trigger: '.lumea-about-stats-row',
      start:   'top 85%',
      once:    true,
      onEnter: function () {
        gsap.to( inners, {
          yPercent: 0,
          duration: 1.0,
          ease:     'power4.out',
          stagger:  0.12,
        } );
      },
    } );

  } )();


  /* ── About story image — mosaic scatter reveal (same as curated product tiles) ── */
  ( function initAboutStoryMosaicReveal() {

    var col = document.querySelector( '.lumea-about-story-img-col' );
    var pin = document.querySelector( '.lumea-about-story-img-pin' );
    if ( ! col || ! pin ) return;

    var img = pin.querySelector( 'img' );
    if ( ! img ) return;

    /* Grid lives inside pin (correct tile size), overflow opens during scatter */
    var grid = document.createElement( 'div' );
    grid.className = 'lumea-mosaic-grid';
    for ( var i = 0; i < 24; i++ ) {
      var span = document.createElement( 'span' );
      span.className = 'lumea-mosaic-tile';
      grid.appendChild( span );
    }
    pin.appendChild( grid );

    var tiles = grid.querySelectorAll( '.lumea-mosaic-tile' );

    ScrollTrigger.create( {
      trigger: pin,
      start:   'top 80%',
      once:    true,
      onEnter: function () {

        /* Open overflow so tiles scatter outside pin bounds */
        pin.style.overflow = 'visible';

        gsap.to( tiles, {
          opacity:  0,
          scale:    0.4,
          rotate:   function () { return gsap.utils.random( -18, 18 ); },
          yPercent: function () { return gsap.utils.random( -80, 80 ); },
          xPercent: function () { return gsap.utils.random( -80, 80 ); },
          duration: 0.9,
          ease:     'power4.inOut',
          stagger:  { amount: 0.65, from: 'random' },
          onComplete: function () {
            gsap.set( grid, { display: 'none' } );
            pin.style.overflow = 'hidden';
          },
        } );

      },
    } );

  } )();


  /* ── About story panels — staggered children reveal per panel ── */
  ( function initAboutStoryPanelReveal() {

    document.querySelectorAll( '.lumea-about-story-panel-js' ).forEach( function ( panel ) {
      var children = Array.prototype.slice.call( panel.children );
      if ( ! children.length ) return;

      gsap.set( children, { autoAlpha: 0, y: 24 } );

      ScrollTrigger.create( {
        trigger: panel,
        start:   'top 65%',
        once:    true,
        onEnter: function () {
          gsap.to( children, {
            autoAlpha: 1,
            y:         0,
            duration:  0.7,
            ease:      'power3.out',
            stagger:   0.12,
          } );
        },
      } );
    } );

  } )();


  /* ── About story rail — accent seam fills as the chapters scroll past ── */
  ( function initAboutStoryRail() {

    var fill = document.querySelector( '.lumea-about-story-rail-js' );
    if ( ! fill ) return;

    gsap.to( fill, {
      scaleY: 1,
      ease:   'none',
      scrollTrigger: {
        trigger: '.lumea-about-story-text-col',
        start:   'top 75%',
        end:     'bottom 40%',
        scrub:   0.4,
      },
    } );

  } )();


  /* ── About values cards — staggered fade-up on grid enter ── */
  ( function initAboutValReveal() {

    var cards = gsap.utils.toArray( '.lumea-about-val-reveal-js' );
    if ( ! cards.length ) return;

    gsap.set( cards, { autoAlpha: 0, y: 32 } );

    ScrollTrigger.create( {
      trigger: '.lumea-about-values-grid',
      start:   'top 75%',
      once:    true,
      onEnter: function () {
        gsap.to( cards, {
          autoAlpha: 1,
          y:         0,
          duration:  0.75,
          ease:      'power3.out',
          stagger:   0.15,
        } );
      },
    } );

  } )();


  /* ── About ingredients cards — staggered fade-up ── */
  ( function initAboutIngCardReveal() {

    var cards = gsap.utils.toArray( '.lumea-about-ing-card-reveal-js' );
    if ( ! cards.length ) return;

    gsap.set( cards, { autoAlpha: 0, y: 28 } );

    ScrollTrigger.create( {
      trigger: '.lumea-about-ing-grid',
      start:   'top 80%',
      once:    true,
      onEnter: function () {
        gsap.to( cards, {
          autoAlpha: 1,
          y:         0,
          duration:  0.7,
          ease:      'power3.out',
          stagger:   0.14,
        } );
      },
    } );

  } )();

} )();

/* ===== hero.js ===== */


( function () {
  'use strict';

  if ( window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) {
    var heroStatic = document.querySelector( '.hero' );
    if ( heroStatic ) {
      heroStatic.querySelectorAll( '.hero-title, .hero-label, .subtitles span, .cta-wrap' ).forEach( function ( el ) {
        el.style.visibility = 'visible';
        el.style.opacity = '1';
      } );
    }
    return;
  }

  const canvas    = document.getElementById( 'heroCanvas' );
  const ctx       = canvas.getContext( '2d', { alpha: false } );
  const hero      = document.querySelector( '.hero' );
  const heroLabel = document.querySelector( '[data-lumea-hero-label]' );
  const baseLayer = document.createElement( 'canvas' );
  const baseCtx   = baseLayer.getContext( '2d', { alpha: false } );

  
  const gsapOk = typeof gsap !== 'undefined';
  let   labelChars         = [];    
  let   labelAnimTriggered = false;
  let   pendingLabelIndex  = -1;
  let   pendingLabelDir    = 0;

  

  function splitIntoChars( el ) {
    const text = el.textContent.trim();
    el.replaceChildren();
    return Array.from( text ).map( function ( ch ) {
      var s = document.createElement( 'span' );
      s.style.cssText = 'display:inline-block;will-change:transform,opacity,filter;opacity:0;';
      s.textContent   = ch === ' ' ? ' ' : ch;
      el.appendChild( s );
      return s;
    } );
  }

  
  function setHeroLabel( index, dir ) {
    if ( ! heroLabel ) return;
    pendingLabelIndex  = index;
    pendingLabelDir    = dir || 0;
    labelAnimTriggered = false;

    if ( ! gsapOk ) {
      heroLabel.textContent = getHeroLabelValue( index );
    }
  }

  
  function fireWaveLabelAnim() {
    if ( labelAnimTriggered || pendingLabelIndex < 0 ) return;
    labelAnimTriggered = true;

    if ( ! gsapOk ) return;

    var dir   = pendingLabelDir;
    var value = getHeroLabelValue( pendingLabelIndex );

    
    gsap.killTweensOf( labelChars );
    gsap.killTweensOf( heroLabel );

    
    heroLabel.textContent = value;
    labelChars = splitIntoChars( heroLabel );
    if ( ! labelChars.length ) return;

    var fromX = dir === 1 ? -22 : 22;

    

    gsap.fromTo( labelChars, {
      opacity:    0,
      y:          20,
      x:          fromX,
      rotationX:  -60,
      filter:     'blur(5px)',
      transformOrigin: '50% 100%',
    }, {
      opacity:   1,
      y:         0,
      x:         0,
      rotationX: 0,
      filter:    'blur(0px)',
      duration:  0.6,
      ease:      'power3.out',
      stagger: {
        each: 0.05,
        from: dir === 1 ? 'start' : 'end',
      },
    } );
  }

  

  const heroMobileMql = window.matchMedia( '(max-width: 767.98px)' );

  function pickHeroUrls() {
    if ( typeof lumea_hero === 'undefined' ) return [];
    var desktop = ( Array.isArray( lumea_hero.images ) && lumea_hero.images.length )
      ? lumea_hero.images
      : ( lumea_hero.imageUrl ? [ lumea_hero.imageUrl ] : [] );
    var mobile  = Array.isArray( lumea_hero.imagesMobile ) ? lumea_hero.imagesMobile : [];

    return desktop
      .map( function ( url, i ) {
        return ( heroMobileMql.matches && mobile[ i ] ) ? mobile[ i ] : url;
      } )
      .filter( Boolean );
  }

  const rawUrls = pickHeroUrls();

  if ( ! rawUrls.length ) {
    if ( hero ) hero.classList.add( 'is-placeholder' );
    return;
  }

  const rawLabels = ( function () {
    if ( typeof lumea_hero === 'undefined' ) return [];
    if ( Array.isArray( lumea_hero.labels ) && lumea_hero.labels.length ) {
      return lumea_hero.labels.map( function ( label ) {
        return String( label || '' ).trim();
      } );
    }
    return [];
  } )();

  function getHeroLabelValue( index ) {
    if ( ! heroLabel ) return '';
    const fallback = String( rawLabels[0] || heroLabel.textContent || '' ).trim();
    return String( rawLabels[ index ] || fallback ).trim() || fallback;
  }

  

  const imgs = new Array( rawUrls.length ).fill( null );
  let readyCount = 0;

  rawUrls.forEach( function ( url, i ) {
    const image   = new Image();
    image.onload  = function () { imgs[i] = image; readyCount++; if ( i === 0 ) resizeCanvas(); };
    image.onerror = function () { readyCount++; };
    image.src     = url;
  } );

  // swap slide sources if the viewport crosses the mobile breakpoint
  heroMobileMql.addEventListener( 'change', function () {
    pickHeroUrls().forEach( function ( url, i ) {
      if ( imgs[ i ] && imgs[ i ].src === url ) return;
      const image  = new Image();
      image.onload = function () { imgs[ i ] = image; if ( i === 0 ) resizeCanvas(); };
      image.src    = url;
    } );
  } );

  

  let currentIndex    = 0;
  let nextIndex       = 1;
  let crossfade       = 0;     
  let isTransitioning = false;
  let lastSlideTime   = -1;    
  let fadeStartTime   = 0;
  let transitionCount = 0;     
  let transitionDir   = 1;     

  const SLIDE_DURATION = 3000;
  const FADE_DURATION  = 2400;   

  function easeInOut( t ) {
    return t < 0.5 ? 2 * t * t : -1 + ( 4 - 2 * t ) * t;
  }

  

  let width  = 0;
  let height = 0;
  let dpr    = Math.min( window.devicePixelRatio || 1, 2 );

  const pointer = {
    x: 0, y: 0, tx: 0, ty: 0,
    inside: false, moved: false,
    radiusRatio: 0.11, radius: 0, strength: 0,
    lastX: 0, lastY: 0, velocityX: 0, velocityY: 0,
    lastMoveTime: -Infinity,
  };

  

  function resizeCanvas() {
    const rect  = canvas.getBoundingClientRect();
    width       = rect.width;
    height      = rect.height;
    dpr         = Math.min( window.devicePixelRatio || 1, 2 );

    canvas.width  = Math.floor( width  * dpr );
    canvas.height = Math.floor( height * dpr );
    ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );

    baseLayer.width  = canvas.width;
    baseLayer.height = canvas.height;
    baseCtx.setTransform( dpr, 0, 0, dpr, 0, 0 );

    pointer.radius = Math.min( width, height ) * pointer.radiusRatio;
  }

  

  function getCoverRect( image, cw, ch ) {
    const ir = image.width / image.height;
    const cr = cw / ch;
    let dw, dh, dx, dy;
    if ( ir > cr ) { dh = ch; dw = dh * ir; dx = ( cw - dw ) / 2; dy = 0; }
    else           { dw = cw; dh = dw / ir; dx = 0; dy = ( ch - dh ) / 2; }
    return { dx, dy, dw, dh };
  }

  

  function applyOverlay( tCtx ) {
    const g = tCtx.createLinearGradient( 0, 0, width, height );
    g.addColorStop( 0,    'rgba(11, 42, 31, 0.42)' );
    g.addColorStop( 0.45, 'rgba(0,  0,  0,  0.02)' );
    g.addColorStop( 1,    'rgba(0,  0,  0,  0.34)' );
    tCtx.fillStyle = g;
    tCtx.fillRect( 0, 0, width, height );
  }

  

  function drawBaseImage( tCtx ) {
    const curr = imgs[ currentIndex ];
    if ( ! curr ) return;

    const c = getCoverRect( curr, width, height );

    tCtx.save();
    tCtx.clearRect( 0, 0, width, height );

    if ( ! isTransitioning ) {
      
      tCtx.drawImage( curr, c.dx, c.dy, c.dw, c.dh );

    } else {
      
      const next = imgs[ nextIndex ];
      const t    = performance.now() * 0.001;

      

      const amp = height * 0.092 * Math.sin( Math.PI * crossfade );

      

      const sweepX = transitionDir === 1
        ? crossfade * ( width + amp * 2 ) - amp
        : ( 1 - crossfade ) * ( width + amp * 2 ) - amp;

      const getWaveX = function ( y ) {
        return sweepX + amp * (
          0.65 * Math.sin( y * 0.010 + t * 1.9 ) +
          0.35 * Math.sin( y * 0.025 - t * 2.3 )
        );
      };

      

      if ( ! labelAnimTriggered && heroLabel ) {
        const heroRect  = hero.getBoundingClientRect();
        const lRect     = heroLabel.getBoundingClientRect();
        const lLeading  = transitionDir === 1
          ? lRect.left  - heroRect.left   
          : lRect.right - heroRect.left;  
        const waveAtLabel = getWaveX( lRect.top - heroRect.top + lRect.height / 2 );
        const crossed = transitionDir === 1
          ? waveAtLabel >= lLeading
          : waveAtLabel <= lLeading;
        if ( crossed ) fireWaveLabelAnim();
      }

      
      tCtx.drawImage( curr, c.dx, c.dy, c.dw, c.dh );

      if ( next && next.naturalWidth ) {
        const n = getCoverRect( next, width, height );

        
        tCtx.save();
        tCtx.beginPath();
        if ( transitionDir === 1 ) {
          
          tCtx.moveTo( -2, -2 );
          tCtx.lineTo( getWaveX( 0 ), -2 );
          for ( let y = 0; y <= height + 2; y += 2 ) {
            tCtx.lineTo( getWaveX( y ), y );
          }
          tCtx.lineTo( -2, height + 2 );
        } else {
          
          tCtx.moveTo( width + 2, -2 );
          tCtx.lineTo( getWaveX( 0 ), -2 );
          for ( let y = 0; y <= height + 2; y += 2 ) {
            tCtx.lineTo( getWaveX( y ), y );
          }
          tCtx.lineTo( width + 2, height + 2 );
        }
        tCtx.closePath();
        tCtx.clip();

        tCtx.drawImage( next, n.dx, n.dy, n.dw, n.dh );
        tCtx.restore();

        

        const glowW = Math.max( 12, height * 0.04 * Math.sin( Math.PI * crossfade ) );
        for ( let y = 0; y < height; y += 2 ) {
          const wx = getWaveX( y );
          const glowGrad = tCtx.createLinearGradient( wx - glowW, y, wx + glowW, y );
          glowGrad.addColorStop( 0,   'rgba(255,255,255,0)' );
          glowGrad.addColorStop( 0.5, 'rgba(255,255,255,0.07)' );
          glowGrad.addColorStop( 1,   'rgba(255,255,255,0)' );
          tCtx.fillStyle = glowGrad;
          tCtx.fillRect( wx - glowW, y, glowW * 2, 2 );
        }
      }
    }

    applyOverlay( tCtx );
    tCtx.restore();
  }

  

  function drawCursorDeformation() {
    if ( ! pointer.moved ) return;

    pointer.x += ( pointer.tx - pointer.x ) * 0.16;
    pointer.y += ( pointer.ty - pointer.y ) * 0.16;
    pointer.velocityX = pointer.x - pointer.lastX;
    pointer.velocityY = pointer.y - pointer.lastY;
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;

    const now      = performance.now();
    const isMoving = pointer.inside && ( now - pointer.lastMoveTime < 72 );

    pointer.strength += ( ( isMoving ? 1 : 0 ) - pointer.strength ) * 0.14;
    if ( pointer.strength < 0.01 ) return;

    const time = now * 0.0012;
    const ssx  = baseLayer.width  / width;
    const ssy  = baseLayer.height / height;
    const speed = Math.hypot( pointer.velocityX, pointer.velocityY );
    const flow  = Math.min( 1, speed / 36 );

    const rx             = pointer.radius * ( 1   + 0.04 * pointer.strength );
    const ry             = pointer.radius * ( 0.9 + 0.02 * Math.sin( time * 1.1 ) );
    const stripH         = 1;
    const swirlS         = rx * ( 0.028 + 0.01 * pointer.strength );
    const pressureS      = rx * ( 0.017 + 0.01 * flow );
    const trailS         = 0.28 + flow * 0.34;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if ( 'imageSmoothingQuality' in ctx ) ctx.imageSmoothingQuality = 'high';

    for ( let y = pointer.y - ry; y <= pointer.y + ry; y += stripH ) {
      const dy = y - pointer.y;
      const ny = dy / ry;
      if ( Math.abs( ny ) >= 1 ) continue;

      const core  = Math.max( 0, 1 - ny * ny );
      const halfW = rx * Math.sqrt( core );
      if ( halfW < 1.2 ) continue;

      const stripX  = pointer.x - halfW;
      const stripW  = halfW * 2;
      const falloff = Math.pow( core, 2.5 );

      const swirl       = Math.sin( dy * 0.018 - time * 2.4 + pointer.x * 0.0018 ) * swirlS * falloff;
      const pressure    = Math.cos( dy * 0.031 + time * 1.55 ) * pressureS * falloff;
      const microRipple = Math.sin( dy * 0.011 - time * 1.15 ) * ( pressureS * 0.35 ) * falloff;
      const trailX      = pointer.velocityX * trailS * falloff;
      const trailY      = pointer.velocityY * ( trailS * 0.1 ) * falloff;
      const shear       = ny * pointer.velocityX * 0.06 * falloff;

      const offsetX = swirl + pressure + microRipple + trailX + shear;
      const offsetY = Math.sin( dy * 0.02 - time * 2.1 ) * ( ry * 0.012 ) * falloff + trailY;

      const srcX = ( stripX - offsetX ) * ssx;
      const srcY = ( y      - offsetY ) * ssy;
      const srcW = stripW  * ssx;
      const srcH = stripH  * ssy;

      if ( srcX < 0 || srcY < 0 || srcX + srcW > baseLayer.width || srcY + srcH > baseLayer.height ) continue;

      ctx.globalAlpha = 0.92 + falloff * 0.08;
      ctx.drawImage( baseLayer, srcX, srcY, srcW, srcH, stripX, y, stripW, stripH + 0.2 );
    }

    ctx.restore();
  }

  

  function drawNoise() {
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.fillStyle   = '#fff';
    for ( let i = 0; i < 90; i++ ) {
      ctx.fillRect( Math.random() * width, Math.random() * height, Math.random() * 1.1, Math.random() * 1.1 );
    }
    ctx.restore();
  }

  

  function render( timestamp ) {

    
    if ( lastSlideTime < 0 ) lastSlideTime = timestamp;

    if ( imgs[0] && imgs[0].naturalWidth ) {

      
      const activeCount = imgs.filter( Boolean ).length;
      if ( activeCount > 1 ) {

        if ( ! isTransitioning && ( timestamp - lastSlideTime ) > SLIDE_DURATION ) {
          isTransitioning = true;
          fadeStartTime   = timestamp;
          transitionDir   = ( transitionCount % 2 === 0 ) ? 1 : -1;
          transitionCount++;
          nextIndex       = ( currentIndex + 1 ) % activeCount;
          setHeroLabel( nextIndex, transitionDir );
        }

        if ( isTransitioning ) {
          const raw  = Math.min( 1, ( timestamp - fadeStartTime ) / FADE_DURATION );
          crossfade  = easeInOut( raw );

          if ( raw >= 1 ) {
            currentIndex    = nextIndex;
            isTransitioning = false;
            crossfade       = 0;
            lastSlideTime   = timestamp;

          }
        }
      }

      
      drawBaseImage( baseCtx );

      ctx.clearRect( 0, 0, width, height );
      ctx.drawImage( baseLayer, 0, 0, baseLayer.width, baseLayer.height, 0, 0, width, height );

      drawCursorDeformation();
      drawNoise();

    } else {
      ctx.fillStyle = '#183b2e';
      ctx.fillRect( 0, 0, width, height );
    }

    requestAnimationFrame( render );
  }

  

  function setPointer( e ) {
    const rect        = canvas.getBoundingClientRect();
    pointer.tx        = e.clientX - rect.left;
    pointer.ty        = e.clientY - rect.top;
    pointer.moved     = true;
    pointer.lastMoveTime = performance.now();
  }

  window.addEventListener( 'resize', resizeCanvas );
  hero.addEventListener( 'pointermove',  setPointer );
  hero.addEventListener( 'pointerenter', function ( e ) {
    pointer.inside = true;
    const rect = canvas.getBoundingClientRect();
    pointer.tx = e.clientX - rect.left;
    pointer.ty = e.clientY - rect.top;
  } );
  hero.addEventListener( 'pointerleave', function () { pointer.inside = false; } );

  resizeCanvas();

  
  if ( heroLabel ) {
    heroLabel.textContent = getHeroLabelValue( 0 );
  }

  requestAnimationFrame( render );

} )();

/* ===== slider.js ===== */


( function () {
  'use strict';

  const slider      = document.getElementById( 'lumeaSlider' );
  if ( ! slider ) return;

  const slidesData  = ( typeof lumea_slider !== 'undefined' && Array.isArray( lumea_slider.slides ) )
    ? lumea_slider.slides
    : [];

  if ( ! slidesData.length ) {
    slider.style.display = 'none';
    return;
  }

  const slidesRoot  = document.getElementById( 'lumeaSlides' );
  const card        = document.getElementById( 'lumeaCard' );
  const numberEl    = document.getElementById( 'lumeaNumber' );
  const textEl      = document.getElementById( 'lumeaText' );
  const cardButton  = document.getElementById( 'lumeaCardButton' );
  const cursorArrow = document.getElementById( 'lumeaCursorArrow' );

  let activeIndex      = 0;
  let cursorSide       = 'right';
  let isCursorBlocked  = false;
  let activeAnimations = [];
  let lastMouseX       = -1;
  let lastMouseY       = -1;
  let touchStartX      = 0;
  let touchStartY      = 0;
  let touchDeltaX      = 0;
  let isSwiping        = false;
  let cardSwapHandler  = null;
  let cardSwapTimer    = null;
  const SWIPE_THRESHOLD = 40;
  const CARD_FADE_MS    = 560;

  function createSlides() {
    slidesData.forEach( function ( slide, index ) {
      const slideEl         = document.createElement( 'div' );
      const slideInner      = document.createElement( 'div' );
      slideEl.className     = 'lumea-slide';
      slideEl.dataset.index = index;
      slideInner.className  = 'lumea-slide-inner';

      if ( slide.image ) {
        const image     = document.createElement( 'img' );
        image.src       = slide.image;
        image.alt       = 'Mustard slide ' + ( index + 1 );
        image.draggable = false;
        slideInner.appendChild( image );
      } else {
        const placeholder = document.createElement( 'div' );
        const mark        = document.createElement( 'span' );
        const label       = document.createElement( 'span' );
        placeholder.className = 'lumea-media-placeholder lumea-media-placeholder--slider';
        mark.className        = 'lumea-media-placeholder-mark';
        label.className       = 'lumea-media-placeholder-label';
        label.textContent     = 'Mustard';
        placeholder.setAttribute( 'aria-hidden', 'true' );
        placeholder.appendChild( mark );
        placeholder.appendChild( label );
        slideInner.appendChild( placeholder );
      }

      slideEl.appendChild( slideInner );
      slidesRoot.appendChild( slideEl );
    } );
  }

  function preloadImages() {
    return Promise.all(
      slidesData.map( function ( slide ) {
        return new Promise( function ( resolve ) {
          if ( ! slide.image ) {
            resolve();
            return;
          }
          const image   = new Image();
          image.onload  = resolve;
          image.onerror = resolve;
          image.src     = slide.image;
        } );
      } )
    );
  }

  function getWrappedIndex( index ) {
    const total = slidesData.length;
    return ( ( index % total ) + total ) % total;
  }

  function getShortestDelta( index, active ) {
    return index - active;
  }

  function updateSlides() {
    document.querySelectorAll( '.lumea-slide' ).forEach( function ( slide ) {
      const index = Number( slide.dataset.index );
      const delta = getShortestDelta( index, activeIndex );
      slide.classList.remove( 'is-active', 'is-prev', 'is-next', 'is-hidden-left', 'is-hidden-right' );
      if      ( delta === 0  ) slide.classList.add( 'is-active' );
      else if ( delta === -1 ) slide.classList.add( 'is-prev' );
      else if ( delta === 1  ) slide.classList.add( 'is-next' );
      else if ( delta < 0    ) slide.classList.add( 'is-hidden-left' );
      else                     slide.classList.add( 'is-hidden-right' );
    } );
  }

  function updateCard() {
    const currentSlide = slidesData[ activeIndex ];

    if ( cardSwapHandler ) {
      card.removeEventListener( 'transitionend', cardSwapHandler );
    }
    clearTimeout( cardSwapTimer );

    card.classList.add( 'is-changing' );

    function swap( event ) {
      if ( event && ( event.target !== card || event.propertyName !== 'opacity' ) ) return;
      card.removeEventListener( 'transitionend', cardSwapHandler );
      clearTimeout( cardSwapTimer );
      cardSwapHandler = null;

      numberEl.textContent = currentSlide.number;
      textEl.textContent   = currentSlide.text;
      if ( cardButton && currentSlide.url ) {
        cardButton.setAttribute( 'href', currentSlide.url );
      }
      requestAnimationFrame( function () {
        card.classList.remove( 'is-changing' );
      } );
    }

    cardSwapHandler = swap;
    card.addEventListener( 'transitionend', cardSwapHandler );
    cardSwapTimer = window.setTimeout( swap, CARD_FADE_MS );
  }

  function clearZoomAnimations() {
    activeAnimations.forEach( function ( animation ) {
      try { animation.cancel(); } catch ( e ) {}
    } );
    activeAnimations = [];
  }

  function animateSlideZoom( currentIndex ) {
    clearZoomAnimations();
    const currentInner = document.querySelector(
      '.lumea-slide[data-index="' + currentIndex + '"] .lumea-slide-inner'
    );
    const timing = { duration: 1280, easing: 'cubic-bezier(0.19, 1, 0.22, 1)', fill: 'both' };
    if ( currentInner ) {
      const animation = currentInner.animate(
        [
          { transform: 'translate3d(0, 0, 0) scale(1.16)' },
          { transform: 'translate3d(0, 0, 0) scale(1)' }
        ],
        timing
      );
      activeAnimations.push( animation );
    }
  }

  function updateButtons() {
    const atStart = activeIndex <= 0;
    const atEnd   = activeIndex >= slidesData.length - 1;
    document.querySelectorAll( '[data-direction="prev"]' ).forEach( function ( btn ) {
      btn.disabled = atStart;
      btn.classList.toggle( 'is-disabled', atStart );
    } );
    document.querySelectorAll( '[data-direction="next"]' ).forEach( function ( btn ) {
      btn.disabled = atEnd;
      btn.classList.toggle( 'is-disabled', atEnd );
    } );
  }

  function goToSlide( direction ) {
    if ( direction === 'prev' && activeIndex <= 0 ) return;
    if ( direction === 'next' && activeIndex >= slidesData.length - 1 ) return;
    activeIndex = direction === 'next' ? activeIndex + 1 : activeIndex - 1;
    updateSlides();
    requestAnimationFrame( function () {
      animateSlideZoom( activeIndex );
      updateCard();
      updateButtons();
      if ( lastMouseX >= 0 ) {
        var rect = slider.getBoundingClientRect();
        if (
          lastMouseX >= rect.left && lastMouseX <= rect.right &&
          lastMouseY >= rect.top  && lastMouseY <= rect.bottom
        ) {
          moveCursor( { clientX: lastMouseX, clientY: lastMouseY, target: slider } );
        }
      }
    } );
  }

  function moveCursor( event ) {
    if ( isCursorBlocked || event.target.closest( '.lumea-card-button' ) ) {
      cursorArrow.classList.remove( 'is-visible', 'is-left', 'is-right' );
      return;
    }

    const rect    = slider.getBoundingClientRect();
    const isLeft  = ( event.clientX - rect.left ) < rect.width / 2;
    const atStart = activeIndex <= 0;
    const atEnd   = activeIndex >= slidesData.length - 1;

    if ( ( isLeft && atStart ) || ( ! isLeft && atEnd ) ) {
      cursorArrow.classList.remove( 'is-visible', 'is-left', 'is-right' );
      slider.classList.add( 'is-cursor-default' );
      return;
    }

    slider.classList.remove( 'is-cursor-default' );

    cursorSide   = isLeft ? 'left' : 'right';
    cursorArrow.style.left = ( event.clientX - rect.left ) + 'px';
    cursorArrow.style.top  = ( event.clientY - rect.top )  + 'px';
    cursorArrow.classList.add( 'is-visible' );
    cursorArrow.classList.toggle( 'is-left',  isLeft );
    cursorArrow.classList.toggle( 'is-right', ! isLeft );
  }

  document.addEventListener( 'mousemove', function ( e ) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  } );

  window.addEventListener( 'scroll', function () {
    if ( lastMouseX < 0 ) return;
    const rect = slider.getBoundingClientRect();
    if (
      lastMouseX >= rect.left && lastMouseX <= rect.right &&
      lastMouseY >= rect.top  && lastMouseY <= rect.bottom
    ) {
      moveCursor( { clientX: lastMouseX, clientY: lastMouseY, target: slider } );
    } else {
      cursorArrow.classList.remove( 'is-visible', 'is-left', 'is-right' );
    }
  }, { passive: true } );

  slider.addEventListener( 'mousemove', moveCursor );

  slider.addEventListener( 'mouseleave', function () {
    cursorArrow.classList.remove( 'is-visible', 'is-left', 'is-right' );
    slider.classList.remove( 'is-cursor-default' );
  } );

  if ( cardButton ) {
    cardButton.addEventListener( 'mouseenter', function () {
      isCursorBlocked = true;
      cursorArrow.classList.remove( 'is-visible', 'is-left', 'is-right' );
    } );
    cardButton.addEventListener( 'mouseleave', function () {
      isCursorBlocked = false;
    } );
  }

  slider.addEventListener( 'click', function ( event ) {
    if ( isSwiping ) return;
    if ( event.target.closest( '.lumea-card-button, .lumea-mobile-arrows' ) ) return;
    goToSlide( cursorSide === 'left' ? 'prev' : 'next' );
  } );

  slider.addEventListener( 'touchstart', function ( event ) {
    if ( event.touches.length !== 1 ) return;
    touchStartX = event.touches[ 0 ].clientX;
    touchStartY = event.touches[ 0 ].clientY;
    touchDeltaX = 0;
    isSwiping   = false;
  }, { passive: true } );

  slider.addEventListener( 'touchmove', function ( event ) {
    if ( event.touches.length !== 1 ) return;
    touchDeltaX = event.touches[ 0 ].clientX - touchStartX;
    const deltaY = event.touches[ 0 ].clientY - touchStartY;
    if ( ! isSwiping && Math.abs( touchDeltaX ) > 10 && Math.abs( touchDeltaX ) > Math.abs( deltaY ) ) {
      isSwiping = true;
    }
  }, { passive: true } );

  slider.addEventListener( 'touchend', function ( event ) {
    if ( event.target.closest( '.lumea-card-button, .lumea-mobile-arrows' ) ) return;
    if ( isSwiping && Math.abs( touchDeltaX ) > SWIPE_THRESHOLD ) {
      goToSlide( touchDeltaX < 0 ? 'next' : 'prev' );
    }
    window.setTimeout( function () { isSwiping = false; }, 300 );
  } );

  slider.querySelectorAll( '[data-direction]' ).forEach( function ( button ) {
    button.addEventListener( 'click', function ( event ) {
      event.stopPropagation();
      goToSlide( button.dataset.direction );
    } );
  } );

  createSlides();
  updateSlides();
  updateCard();
  updateButtons();

  preloadImages().then( function () {
    requestAnimationFrame( function () {
      slider.classList.remove( 'is-loading' );
      lumeaSliderEntrance();
    } );
  } );

  function lumeaSliderEntrance() {
    if ( typeof gsap === 'undefined' ) return;
    const visible = slidesRoot.querySelectorAll( '.lumea-slide.is-prev, .lumea-slide.is-active, .lumea-slide.is-next' );
    if ( ! visible.length ) return;

    gsap.set( visible, { autoAlpha: 0 } );

    const io = new IntersectionObserver( function ( entries ) {
      if ( ! entries[ 0 ].isIntersecting ) return;
      gsap.to( visible, { autoAlpha: 1, duration: 1.0, ease: 'power2.out', stagger: 0.15 } );
      io.disconnect();
    }, { threshold: 0.35 } );

    io.observe( slider );
  }

} )();

/* ===== occasion.js ===== */
( function () {
  'use strict';

  var list = document.querySelector( '[data-occ-list]' );
  if ( ! list ) return;

  var items  = Array.prototype.slice.call( list.querySelectorAll( '[data-occ-item]' ) );
  var slides = Array.prototype.slice.call( document.querySelectorAll( '[data-occ-slide]' ) );
  if ( ! items.length || ! slides.length ) return;

  function activate( index ) {
    items.forEach( function ( item, i ) {
      var isActive = i === index;
      item.classList.toggle( 'is-active', isActive );
      var tab = item.querySelector( '[data-occ-tab]' );
      if ( tab ) tab.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
    } );
    slides.forEach( function ( slide, i ) {
      slide.classList.toggle( 'is-active', i === index );
    } );
  }

  items.forEach( function ( item, index ) {
    var tab = item.querySelector( '[data-occ-tab]' );
    if ( ! tab ) return;
    tab.addEventListener( 'click', function () {
      if ( item.classList.contains( 'is-active' ) ) return;
      activate( index );
    } );
  } );

} )();

/* ===== bestsellers.js ===== */


( function () {
  'use strict';

  if ( typeof Swiper === 'undefined' ) return;

  new Swiper( '.lumea-best-swiper', {
    slidesPerView: 1.3,
    spaceBetween:  16,
    speed:         680,
    grabCursor:    true,

    navigation: {
      nextEl: '.lumea-best-next',
      prevEl: '.lumea-best-prev',
    },

    breakpoints: {
      600:  { slidesPerView: 2.2, spaceBetween: 16 },
      1024: { slidesPerView: 4,   spaceBetween: 24 },
    },
  } );

} )();

/* ===== categories.js ===== */
( function () {
  'use strict';

  if ( typeof Swiper === 'undefined' ) return;
  if ( ! document.querySelector( '.lumea-cat-swiper' ) ) return;

  new Swiper( '.lumea-cat-swiper', {
    slidesPerView: 1.4,
    spaceBetween:  16,
    speed:         680,
    grabCursor:    true,

    navigation: {
      nextEl: '.lumea-cat-next',
      prevEl: '.lumea-cat-prev',
    },

    breakpoints: {
      600:  { slidesPerView: 2.2, spaceBetween: 16 },
      1024: { slidesPerView: 4,   spaceBetween: 24 },
    },
  } );

} )();

/* ===== eos-sale.js ===== */
( function () {
  'use strict';

  if ( typeof Swiper === 'undefined' ) return;
  if ( ! document.querySelector( '.lumea-eos-swiper' ) ) return;

  new Swiper( '.lumea-eos-swiper', {
    slidesPerView: 3,
    spaceBetween:  12,
    speed:         500,
    loop:          false,
    grabCursor:    true,

    pagination: {
      el: '.lumea-eos-pagination',
      clickable: true,
    },
  } );

} )();

/* ===== testimonials.js ===== */
( function () {
  'use strict';

  var section = document.querySelector( '[data-lumea-testi]' );
  if ( ! section ) return;

  var persons = Array.prototype.slice.call( section.querySelectorAll( '.lumea-testi-person' ) );
  var bubbles = Array.prototype.slice.call( section.querySelectorAll( '.lumea-testi-bubble' ) );
  var dots = Array.prototype.slice.call( section.querySelectorAll( '.lumea-testi-dot' ) );
  if ( persons.length < 2 ) return;

  var current = 0;
  var timer = null;
  var DELAY = 5000;
  var reduceMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

  function show( index ) {
    current = ( index + persons.length ) % persons.length;
    persons.forEach( function ( el, i ) {
      el.classList.toggle( 'is-active', i === current );
    } );
    bubbles.forEach( function ( el, i ) {
      el.classList.toggle( 'is-active', i === current );
    } );
    dots.forEach( function ( el, i ) {
      el.classList.toggle( 'is-active', i === current );
    } );
  }

  function next() {
    show( current + 1 );
  }

  function start() {
    if ( reduceMotion ) return;
    stop();
    timer = setInterval( next, DELAY );
  }

  function stop() {
    clearInterval( timer );
  }

  bubbles.concat( dots ).forEach( function ( control ) {
    control.addEventListener( 'click', function () {
      show( parseInt( control.getAttribute( 'data-testi-target' ), 10 ) );
      start();
    } );
  } );

  section.addEventListener( 'mouseenter', stop );
  section.addEventListener( 'mouseleave', start );
  section.addEventListener( 'focusin', stop );
  section.addEventListener( 'focusout', start );

  start();
} )();

/* ===== ritual.js ===== */
/* ── Shared peel-effect helpers ─────────────────────────────────
   Used by both the desktop (scroll-driven) and mobile (swipe-driven)
   ritual decks so the exact same WebGL peel shader renders both. */

function lumeaClamp( value, min, max ) {
  return Math.min( max, Math.max( min, value ) );
}

function lumeaSmooth( value ) {
  return value * value * ( 3 - 2 * value );
}

function lumeaCoverDraw( ctx, img, dx, dy, dw, dh ) {
  var iw = img.naturalWidth;
  var ih = img.naturalHeight;
  if ( ! iw || ! ih ) return;
  var scale = Math.max( dw / iw, dh / ih );
  var sw = dw / scale;
  var sh = dh / scale;
  ctx.drawImage( img, ( iw - sw ) / 2, ( ih - sh ) / 2, sw, sh, dx, dy, dw, dh );
}

function lumeaDrawTextEl( ctx, el, cardRect, options ) {
  if ( ! el ) return;
  options = options || {};

  var cs = window.getComputedStyle( el );
  var rect = el.getBoundingClientRect();
  var x = rect.left - cardRect.left;
  var y = rect.top - cardRect.top;
  var text = el.textContent.replace( /\s+/g, ' ' ).trim();

  if ( ! text ) return;
  if ( cs.textTransform === 'uppercase' ) text = text.toUpperCase();

  var fontSize = parseFloat( cs.fontSize );
  var lineHeight = parseFloat( cs.lineHeight );
  if ( ! lineHeight || isNaN( lineHeight ) ) lineHeight = fontSize * 1.2;

  var padLeft = parseFloat( cs.paddingLeft ) || 0;
  var padRight = parseFloat( cs.paddingRight ) || 0;
  var padTop = parseFloat( cs.paddingTop ) || 0;
  x += padLeft;
  y += padTop;

  ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fontSize + 'px ' + cs.fontFamily;
  if ( 'letterSpacing' in ctx && cs.letterSpacing !== 'normal' ) {
    ctx.letterSpacing = cs.letterSpacing;
  }
  ctx.textBaseline = 'alphabetic';

  // Word-wrap against the element's own laid-out width.
  var maxWidth = Math.max( 10, el.clientWidth - padLeft - padRight );
  var words = text.split( ' ' );
  var lines = [];
  var line = '';

  words.forEach( function ( word ) {
    var probe = line ? line + ' ' + word : word;
    if ( line && ctx.measureText( probe ).width > maxWidth ) {
      lines.push( line );
      line = word;
    } else {
      line = probe;
    }
  } );
  if ( line ) lines.push( line );

  lines.forEach( function ( ln, i ) {
    var metrics = ctx.measureText( ln );
    var ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
    var descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
    var hasMetrics = typeof ascent === 'number' && typeof descent === 'number' && isFinite( ascent ) && isFinite( descent ) && ascent + descent > 0;
    var baseline;

    if ( hasMetrics ) {
      baseline = y + i * lineHeight + ( lineHeight - ascent - descent ) / 2 + ascent;
    } else {
      baseline = y + i * lineHeight + ( lineHeight + fontSize * 0.72 ) / 2 - fontSize * 0.08;
    }

    if ( options.stroke ) {
      ctx.strokeStyle = cs.webkitTextStrokeColor || cs.color;
      ctx.lineWidth = Math.max( 1, parseFloat( cs.webkitTextStrokeWidth ) || 1 );
      ctx.strokeText( ln, x, baseline );
    } else {
      ctx.fillStyle = cs.color;
      ctx.fillText( ln, x, baseline );
    }
  } );

  if ( 'letterSpacing' in ctx ) {
    ctx.letterSpacing = '0px';
  }
}

function lumeaDrawRuleEl( ctx, el, cardRect ) {
  if ( ! el ) return;
  var cs = window.getComputedStyle( el );
  var rect = el.getBoundingClientRect();
  if ( rect.width < 1 || rect.height < 1 ) return;
  ctx.fillStyle = cs.backgroundColor;
  ctx.fillRect( rect.left - cardRect.left, rect.top - cardRect.top, rect.width, rect.height );
}

// Pill/box backgrounds (rounded rect + border), e.g. the kicker chip.
function lumeaDrawBoxEl( ctx, el, cardRect ) {
  if ( ! el ) return;
  var cs = window.getComputedStyle( el );
  var rect = el.getBoundingClientRect();
  if ( rect.width < 1 || rect.height < 1 ) return;

  var x = rect.left - cardRect.left;
  var y = rect.top - cardRect.top;
  var radius = Math.min( parseFloat( cs.borderTopLeftRadius ) || 0, rect.height / 2 );

  ctx.beginPath();
  if ( typeof ctx.roundRect === 'function' ) {
    ctx.roundRect( x, y, rect.width, rect.height, radius );
  } else {
    ctx.rect( x, y, rect.width, rect.height );
  }

  if ( cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ) {
    ctx.fillStyle = cs.backgroundColor;
    ctx.fill();
  }

  var borderWidth = parseFloat( cs.borderTopWidth ) || 0;
  if ( borderWidth > 0 ) {
    ctx.strokeStyle = cs.borderTopColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
  }
}

/* ── WebGL peel (same shader for both desktop + mobile decks) ──── */

var lumeaPeelVertexSource = [
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
  '}',
].join( '' );

var lumeaPeelFragmentSource = [
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
  '}',
].join( '' );

function lumeaCreatePeelMedia( canvas, count ) {
  var gl = canvas.getContext( 'webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  } );

  if ( ! gl ) return null;

  function compile( type, source ) {
    var shader = gl.createShader( type );
    gl.shaderSource( shader, source );
    gl.compileShader( shader );
    if ( ! gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) {
      gl.deleteShader( shader );
      return null;
    }
    return shader;
  }

  var vertex = compile( gl.VERTEX_SHADER, lumeaPeelVertexSource );
  var fragment = compile( gl.FRAGMENT_SHADER, lumeaPeelFragmentSource );
  if ( ! vertex || ! fragment ) return null;

  var program = gl.createProgram();
  gl.attachShader( program, vertex );
  gl.attachShader( program, fragment );
  gl.linkProgram( program );
  if ( ! gl.getProgramParameter( program, gl.LINK_STATUS ) ) {
    gl.deleteProgram( program );
    return null;
  }
  gl.useProgram( program );

  var segmentX = 128;
  var segmentY = 80;
  var vertices = [];
  var indices = [];

  for ( var iy = 0; iy <= segmentY; iy++ ) {
    for ( var ix = 0; ix <= segmentX; ix++ ) {
      vertices.push( ix / segmentX, iy / segmentY );
    }
  }

  for ( iy = 0; iy < segmentY; iy++ ) {
    for ( ix = 0; ix < segmentX; ix++ ) {
      var a = iy * ( segmentX + 1 ) + ix;
      var b = a + 1;
      var c = a + segmentX + 1;
      var d = c + 1;
      indices.push( a, c, b, b, c, d );
    }
  }

  var vertexBuffer = gl.createBuffer();
  gl.bindBuffer( gl.ARRAY_BUFFER, vertexBuffer );
  gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertices ), gl.STATIC_DRAW );

  var indexBuffer = gl.createBuffer();
  gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, indexBuffer );
  gl.bufferData( gl.ELEMENT_ARRAY_BUFFER, new Uint16Array( indices ), gl.STATIC_DRAW );

  var position = gl.getAttribLocation( program, 'aPos' );
  gl.enableVertexAttribArray( position );
  gl.vertexAttribPointer( position, 2, gl.FLOAT, false, 0, 0 );

  var uniforms = {
    from: gl.getUniformLocation( program, 'uFrom' ),
    to: gl.getUniformLocation( program, 'uTo' ),
    show: gl.getUniformLocation( program, 'uShow' ),
    viewport: gl.getUniformLocation( program, 'uViewport' ),
    imageAspect: gl.getUniformLocation( program, 'uImageAspect' ),
    r0: gl.getUniformLocation( program, 'uR0' ),
    r1: gl.getUniformLocation( program, 'uR1' ),
  };

  gl.enable( gl.BLEND );
  gl.blendFunc( gl.ONE, gl.ONE_MINUS_SRC_ALPHA );

  var textures = [];
  for ( var i = 0; i < count; i++ ) {
    var texture = gl.createTexture();
    gl.bindTexture( gl.TEXTURE_2D, texture );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    textures.push( { texture: texture, aspect: 16 / 9, ready: false } );
  }

  function upload( index, sourceCanvas ) {
    var record = textures[ index ];
    if ( ! record || ! sourceCanvas ) return;
    try {
      record.aspect = sourceCanvas.width / Math.max( 1, sourceCanvas.height );
      gl.bindTexture( gl.TEXTURE_2D, record.texture );
      gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas );
      record.ready = true;
    } catch ( e ) {
      record.ready = false;
    }
  }

  var dpr = Math.min( window.devicePixelRatio || 1, 1.5 );

  function resize() {
    canvas.width = Math.round( window.innerWidth * dpr );
    canvas.height = Math.round( window.innerHeight * dpr );
    gl.viewport( 0, 0, canvas.width, canvas.height );
  }

  function clear() {
    gl.clearColor( 0, 0, 0, 0 );
    gl.clear( gl.COLOR_BUFFER_BIT );
  }

  function draw( config ) {
    var record = textures[ config.imageIndex ];
    clear();
    if ( ! record || ! record.ready ) return false;

    gl.useProgram( program );
    gl.bindTexture( gl.TEXTURE_2D, record.texture );
    gl.uniform4f( uniforms.from, config.from.x, config.from.y, Math.max( 1, config.from.w ), Math.max( 1, config.from.h ) );
    gl.uniform4f( uniforms.to, config.to.x, config.to.y, Math.max( 1, config.to.w ), Math.max( 1, config.to.h ) );
    gl.uniform1f( uniforms.show, config.show );
    gl.uniform2f( uniforms.viewport, window.innerWidth, window.innerHeight );
    gl.uniform1f( uniforms.imageAspect, record.aspect );
    gl.uniform1f( uniforms.r0, Math.max( 0, config.r0 ) );
    gl.uniform1f( uniforms.r1, Math.max( 0, config.r1 ) );
    gl.drawElements( gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0 );
    return true;
  }

  resize();
  window.addEventListener( 'resize', resize );

  return {
    draw: draw,
    clear: clear,
    upload: upload,
    isReady: function ( index ) {
      return !! ( textures[ index ] && textures[ index ].ready );
    },
  };
}

/* ── Desktop: scroll-driven pinned deck ─────────────────────────── */
( function () {
  'use strict';

  var section = document.getElementById( 'lumeaRitual' );
  if ( ! section ) return;

  var stage = section.querySelector( '.lumea-ritual-stage' );
  var cards = Array.from( section.querySelectorAll( '.lumea-ritual-card' ) );
  var dots = section.querySelector( '#lumeaRitualProgressDots' );
  var slideLabel = section.querySelector( '#lumeaRitualSlideLabel' );
  var hasGsap = typeof gsap !== 'undefined';
  var hasScrollTrigger = hasGsap && typeof ScrollTrigger !== 'undefined';

  if ( window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) {
    section.classList.add( 'is-ritual-static' );
    return;
  }

  if ( ! window.matchMedia( '(min-width: 992px)' ).matches || ! stage || cards.length < 2 ) return;

  if ( hasScrollTrigger ) {
    gsap.registerPlugin( ScrollTrigger );
  }

  section.style.setProperty( '--mustard-ritual-dot-count', cards.length );

  if ( dots ) {
    cards.forEach( function () {
      var dot = document.createElement( 'span' );
      var fill = document.createElement( 'span' );
      dot.className = 'lumea-ritual-dot';
      dot.appendChild( fill );
      dots.appendChild( dot );
    } );
  }

  /* Card rasterizer — the peel shader can only distort textures, so
     each card (content + image, one object) is drawn into an offscreen
     2D canvas from its real computed styles and geometry. The texture
     is only ever seen mid-flight and distorted — the resting card is
     always the crisp DOM element. */
  function renderCardToCanvas( card ) {
    var cardRect = card.getBoundingClientRect();
    if ( cardRect.width < 10 || cardRect.height < 10 ) return null;

    var scale = Math.min( window.devicePixelRatio || 1, 2 );
    var canvas = document.createElement( 'canvas' );
    canvas.width = Math.round( cardRect.width * scale );
    canvas.height = Math.round( cardRect.height * scale );

    var ctx = canvas.getContext( '2d' );
    if ( ! ctx ) return null;
    ctx.scale( scale, scale );

    // Surface
    var cardStyle = window.getComputedStyle( card );
    ctx.fillStyle = cardStyle.backgroundColor && cardStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cardStyle.backgroundColor : '#ffffff';
    ctx.fillRect( 0, 0, cardRect.width, cardRect.height );

    var body = card.querySelector( '.lumea-ritual-card-body' );
    if ( body ) {
      var bodyRect = body.getBoundingClientRect();
      var bx = bodyRect.left - cardRect.left;
      var by = bodyRect.top - cardRect.top;
      var gradient = ctx.createRadialGradient( bx, by, 0, bx, by, Math.max( bodyRect.width * 1.2, bodyRect.height * 0.8 ) );
      gradient.addColorStop( 0, 'rgba(166, 94, 85, 0.06)' );
      gradient.addColorStop( 0.55, 'rgba(166, 94, 85, 0)' );
      ctx.fillStyle = gradient;
      ctx.fillRect( bx, by, bodyRect.width, bodyRect.height );
    }

    // Image half
    var img = card.querySelector( '.lumea-ritual-card-media img' );
    if ( img && img.complete && img.naturalWidth ) {
      var mediaRect = card.querySelector( '.lumea-ritual-card-media' ).getBoundingClientRect();
      lumeaCoverDraw( ctx, img, mediaRect.left - cardRect.left, mediaRect.top - cardRect.top, mediaRect.width, mediaRect.height );
    }

    // Content half — drawn from each element's computed style + position.
    var kicker = card.querySelector( '.lumea-ritual-card-kicker' );
    lumeaDrawTextEl( ctx, card.querySelector( '.lumea-ritual-card-num' ), cardRect );
    lumeaDrawBoxEl( ctx, kicker, cardRect );
    lumeaDrawTextEl( ctx, kicker, cardRect );
    lumeaDrawTextEl( ctx, card.querySelector( '.lumea-ritual-card-title-main' ), cardRect );
    lumeaDrawTextEl( ctx, card.querySelector( '.lumea-ritual-card-title-alt' ), cardRect );
    lumeaDrawRuleEl( ctx, card.querySelector( '.lumea-ritual-card-rule' ), cardRect );
    lumeaDrawTextEl( ctx, card.querySelector( '.lumea-ritual-card-text' ), cardRect );

    return canvas;
  }

  var canvas = document.createElement( 'canvas' );
  canvas.className = 'lumea-ritual-peel-canvas';
  canvas.setAttribute( 'aria-hidden', 'true' );
  document.body.appendChild( canvas );

  var peel = window.WebGLRenderingContext ? lumeaCreatePeelMedia( canvas, cards.length ) : null;

  /* Rasterize every card once fonts + its image are ready, and again
     whenever the layout can have changed size. */
  var rebuildTimer = null;

  function buildTextures() {
    if ( ! peel ) return;
    cards.forEach( function ( card, index ) {
      var snapshot = renderCardToCanvas( card );
      if ( snapshot ) {
        peel.upload( index, snapshot );
      }
    } );
  }

  function queueBuildTextures() {
    clearTimeout( rebuildTimer );
    rebuildTimer = setTimeout( buildTextures, 180 );
  }

  if ( peel ) {
    var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then( queueBuildTextures );

    cards.forEach( function ( card ) {
      var img = card.querySelector( '.lumea-ritual-card-media img' );
      if ( img && ! img.complete ) {
        img.addEventListener( 'load', queueBuildTextures );
      }
    } );

    window.addEventListener( 'resize', queueBuildTextures );
    queueBuildTextures();
  }

  function initRitualEntrance() {
    if ( ! hasGsap || ! hasScrollTrigger ) return;

    var desktop = section.querySelector( '.lumea-ritual-desktop' );
    var progressRow = section.querySelector( '.lumea-ritual-progress-row' );
    var baseCard = cards[ 0 ];
    if ( ! desktop || ! baseCard ) return;

    var media = baseCard.querySelector( '.lumea-ritual-card-media' );
    var mediaImg = baseCard.querySelector( '.lumea-ritual-card-media img' );
    var body = baseCard.querySelector( '.lumea-ritual-card-body' );
    var contentEls = body ? Array.prototype.slice.call( body.children ) : [];
    var mosaic = null;
    var tiles = [];
    var entranceTrigger = null;
    var entrancePlayed = false;

    if ( progressRow ) {
      contentEls.push( progressRow );
    }

    if ( media ) {
      media.style.overflow = 'hidden';

      mosaic = document.createElement( 'div' );
      mosaic.className = 'lumea-mosaic-grid';
      for ( var i = 0; i < 24; i++ ) {
        var tile = document.createElement( 'span' );
        tile.className = 'lumea-mosaic-tile';
        mosaic.appendChild( tile );
      }
      media.appendChild( mosaic );
      tiles = Array.prototype.slice.call( mosaic.querySelectorAll( '.lumea-mosaic-tile' ) );
    }

    if ( mediaImg ) {
      gsap.set( mediaImg, {
        scale:           1.18,
        filter:          'blur(8px)',
        transformOrigin: 'top right',
      } );
    }

    if ( contentEls.length ) {
      gsap.set( contentEls, {
        autoAlpha: 0,
        y:         24,
      } );
    }

    function playEntrance() {
      if ( entrancePlayed ) return;
      entrancePlayed = true;

      if ( entranceTrigger ) {
        entranceTrigger.kill( false );
      }

      if ( tiles.length ) {
        gsap.to( tiles, {
          opacity:  0,
          scale:    0.4,
          rotate:   function () { return gsap.utils.random( -18, 18 ); },
          yPercent: function () { return gsap.utils.random( -80, 80 ); },
          xPercent: function () { return gsap.utils.random( -80, 80 ); },
          duration: 0.9,
          ease:     'power4.inOut',
          stagger:  { amount: 0.65, from: 'random' },
          onComplete: function () {
            gsap.set( mosaic, { display: 'none' } );
          },
        } );
      }

      if ( mediaImg ) {
        gsap.to( mediaImg, {
          scale:    1,
          filter:   'blur(0px)',
          duration: 1.35,
          ease:     'power4.out',
          onComplete: function () {
            gsap.set( mediaImg, { clearProps: 'filter,transform' } );
            queueBuildTextures();
          },
        } );
      }

      if ( contentEls.length ) {
        gsap.to( contentEls, {
          autoAlpha: 1,
          y:         0,
          duration:  0.7,
          ease:      'power3.out',
          stagger:   0.12,
          delay:     0.12,
          onComplete: function () {
            gsap.set( contentEls, { clearProps: 'visibility,opacity,transform' } );
          },
        } );
      }
    }

    entranceTrigger = ScrollTrigger.create( {
      trigger:     desktop,
      start:       'top 60%',
      once:        true,
      onEnter:     playEntrance,
      onEnterBack: playEntrance,
    } );

    window.requestAnimationFrame( function () {
      var rect = section.getBoundingClientRect();
      if ( rect.top < window.innerHeight * 0.82 && rect.bottom > 0 ) {
        playEntrance();
      }
    } );
  }

  initRitualEntrance();

  /* ── Scroll-driven deck ──────────────────────────────────────── */

  // Pre-decode every card image so the DOM card is paint-ready the
  // instant it becomes the base — no blank-image flash at docking.
  cards.forEach( function ( card ) {
    var img = card.querySelector( '.lumea-ritual-card-media img' );
    if ( img && typeof img.decode === 'function' ) {
      img.decode().catch( function () {} );
    }
  } );

  var scrollProgress = 0;
  var activeBase = 0;
  var activeCaption = 0;
  var flying = -1;
  var flightIndex = -1;
  var flightMode = '';
  var dockLinger = 0;

  function setBase( index ) {
    if ( activeBase === index ) return;
    activeBase = index;
    cards.forEach( function ( card, i ) {
      card.classList.toggle( 'is-base', i === index );
    } );
  }

  function setCaption( index ) {
    if ( activeCaption === index || ! cards[ index ] ) return;
    activeCaption = index;
    if ( slideLabel ) {
      slideLabel.textContent = ( cards[ index ].dataset.title || '' ) + ' · ' + String( index + 1 ).padStart( 2, '0' ) + ' / ' + String( cards.length ).padStart( 2, '0' );
    }
  }

  function updateDots( raw ) {
    if ( ! dots ) return;
    Array.from( dots.children ).forEach( function ( dot, index ) {
      var fill = dot.firstElementChild;
      var amount = lumeaClamp( raw - index + 1, 0, 1 );
      dot.classList.toggle( 'is-current', index === Math.round( raw ) );
      if ( fill ) {
        fill.style.transform = 'scaleX(' + amount + ')';
      }
    } );
  }

  /* DOM flight — only used when WebGL is unavailable or a texture
     isn't ready yet: same choreography, without the mesh distortion. */
  function clearDomFlight() {
    if ( flying < 0 ) return;
    var card = cards[ flying ];
    card.style.opacity = '';
    card.style.transform = '';
    card.style.transformOrigin = '';
    card.style.borderRadius = '';
    card.style.clipPath = '';
    card.style.zIndex = '';
    flying = -1;
  }

  function renderDomFlight( index, t ) {
    var card = cards[ index ];
    if ( ! card ) return;

    if ( flying !== index ) clearDomFlight();
    flying = index;

    var eased = lumeaSmooth( t );
    var radius = 999 - eased * 975;

    card.style.zIndex = '3';
    card.style.opacity = t > 0.015 ? '1' : '0';
    card.style.transformOrigin = '50% 100%';
    card.style.transform = 'translateY(' + ( ( 1 - eased ) * 112 ) + '%) scale(' + ( 0.72 + eased * 0.28 ) + ') rotate(' + ( ( 1 - eased ) * -5 ) + 'deg)';
    card.style.borderRadius = radius + 'px';
    card.style.clipPath = 'inset(' + ( ( 1 - eased ) * 22 ) + '% ' + ( ( 1 - eased ) * 20 ) + '% 0 round ' + radius + 'px)';
  }

  function peelRects() {
    var rect = stage.getBoundingClientRect();
    return {
      from: {
        x: rect.left + rect.width * 0.22,
        y: Math.max( window.innerHeight + 36, rect.bottom + rect.height * 0.22 ),
        w: rect.width * 0.56,
        h: Math.max( 96, rect.height * 0.22 ),
      },
      to: {
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
      },
    };
  }

  function drawPeel( index, show ) {
    var rects = peelRects();
    return peel.draw( {
      imageIndex: index,
      from: rects.from,
      to: rects.to,
      show: show,
      r0: Math.min( rects.from.w, rects.from.h ) / 2,
      r1: 24,
    } );
  }

  function render() {
    var last = cards.length - 1;
    var raw = lumeaClamp( scrollProgress * last, 0, last );
    var current = Math.floor( raw );

    if ( current >= last ) {
      current = last - 1;
    }

    var next = current + 1;
    var t = lumeaClamp( raw - current, 0, 1 );

    setCaption( lumeaClamp( Math.round( raw ), 0, last ) );
    updateDots( raw );

    if ( t < 0.006 || t > 0.994 ) {
      var landed = t > 0.994;
      setBase( landed ? next : current );
      clearDomFlight();

      // Hold the docked WebGL frame a couple of ticks so the DOM card
      // underneath is guaranteed painted before the canvas hides —
      // kills the flash at the end of a transition.
      if ( landed && flightMode === 'gl' && dockLinger < 3 && peel ) {
        dockLinger++;
        if ( drawPeel( next, 1 ) ) {
          canvas.style.opacity = '1';
          return;
        }
      }

      flightIndex = -1;
      flightMode = '';
      dockLinger = 0;
      canvas.style.opacity = '0';
      if ( peel ) {
        peel.clear();
      }
      return;
    }

    dockLinger = 0;
    setBase( current );

    // Lock the render path for the whole transition: if the texture
    // wasn't ready when this flight started, stay on the DOM flight —
    // never switch mid-air (that caused a visible flicker/reset).
    if ( flightIndex !== next ) {
      flightIndex = next;
      flightMode = peel && peel.isReady( next ) ? 'gl' : 'dom';
    }

    if ( flightMode === 'gl' ) {
      var drawn = drawPeel( next, t );
      canvas.style.opacity = drawn ? '1' : '0';
      if ( drawn ) {
        clearDomFlight();
      } else {
        flightMode = 'dom';
        renderDomFlight( next, t );
      }
    } else {
      canvas.style.opacity = '0';
      if ( peel ) {
        peel.clear();
      }
      renderDomFlight( next, t );
    }
  }

  if ( hasScrollTrigger ) {
    ScrollTrigger.create( {
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: function ( self ) {
        scrollProgress = self.progress;
      },
    } );

    gsap.ticker.add( render );
  } else {
    var onScroll = function () {
      var distance = Math.max( 1, section.offsetHeight - window.innerHeight );
      scrollProgress = lumeaClamp( ( window.scrollY - section.offsetTop ) / distance, 0, 1 );
      render();
    };

    window.addEventListener( 'scroll', onScroll, { passive: true } );
    window.addEventListener( 'resize', onScroll );
    onScroll();
  }

  render();

  window.addEventListener( 'load', function () {
    if ( hasScrollTrigger ) {
      ScrollTrigger.refresh();
    }
    queueBuildTextures();
  } );
} )();

/* ── Mobile: simple swipe carousel (Swiper's built-in coverflow effect) ── */
( function () {
  'use strict';

  if ( typeof Swiper === 'undefined' ) return;

  var swiperEl = document.querySelector( '.lumea-ritual-mobile .lumea-ritual-swiper' );
  if ( ! swiperEl ) return;

  var mobile = swiperEl.closest( '.lumea-ritual-mobile' );

  var swiper = new Swiper( swiperEl, {
    effect: 'coverflow',
    centeredSlides: true,
    slidesPerView: 'auto',
    speed: 500,
    grabCursor: true,
    coverflowEffect: {
      rotate: 24,
      stretch: 0,
      depth: 90,
      modifier: 1,
      slideShadows: false,
    },
    pagination: {
      el: '.lumea-ritual-swiper-pagination',
      clickable: true,
    },
  } );

  function initMobileRitualEntrance() {
    if ( ! mobile || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' ) return;
    if ( window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches ) return;
    if ( ! window.matchMedia( '(max-width: 991px)' ).matches ) return;

    gsap.registerPlugin( ScrollTrigger );

    var cards = Array.from( mobile.querySelectorAll( '.lumea-ritual-mobile-card' ) );
    var pagination = mobile.querySelector( '.lumea-ritual-swiper-pagination' );
    var entranceTrigger = null;
    var entrancePlayed = false;
    if ( ! cards.length ) return;

    cards.forEach( function ( card ) {
      var wrap = card.querySelector( '.lumea-ritual-mobile-img-wrap' );
      var img = card.querySelector( '.lumea-ritual-mobile-img' );
      var content = Array.from( card.querySelectorAll( '.lumea-ritual-mobile-title, .lumea-ritual-mobile-text' ) );

      if ( wrap && ! wrap.querySelector( '.lumea-mosaic-grid' ) ) {
        var grid = document.createElement( 'div' );
        grid.className = 'lumea-mosaic-grid';
        for ( var i = 0; i < 24; i++ ) {
          var tile = document.createElement( 'span' );
          tile.className = 'lumea-mosaic-tile';
          grid.appendChild( tile );
        }
        wrap.appendChild( grid );
      }

      if ( img ) {
        gsap.set( img, {
          scale:           1.18,
          filter:          'blur(8px)',
          transformOrigin: 'top right',
        } );
      }

      if ( content.length ) {
        gsap.set( content, {
          autoAlpha: 0,
          y:         24,
        } );
      }
    } );

    if ( pagination ) {
      gsap.set( pagination, {
        autoAlpha: 0,
        y:         16,
      } );
    }

    function playEntrance() {
      if ( entrancePlayed ) return;
      entrancePlayed = true;

      if ( entranceTrigger ) {
        entranceTrigger.kill( false );
      }

      cards.forEach( function ( card, index ) {
        var delay = index * 0.12;
        var mosaic = card.querySelector( '.lumea-mosaic-grid' );
        var tiles = mosaic ? Array.from( mosaic.querySelectorAll( '.lumea-mosaic-tile' ) ) : [];
        var img = card.querySelector( '.lumea-ritual-mobile-img' );
        var content = Array.from( card.querySelectorAll( '.lumea-ritual-mobile-title, .lumea-ritual-mobile-text' ) );

        if ( tiles.length ) {
          gsap.to( tiles, {
            opacity:  0,
            scale:    0.4,
            rotate:   function () { return gsap.utils.random( -18, 18 ); },
            yPercent: function () { return gsap.utils.random( -80, 80 ); },
            xPercent: function () { return gsap.utils.random( -80, 80 ); },
            duration: 0.9,
            ease:     'power4.inOut',
            delay:    delay,
            stagger:  { amount: 0.5, from: 'random' },
            onComplete: function () {
              gsap.set( mosaic, { display: 'none' } );
            },
          } );
        }

        if ( img ) {
          gsap.to( img, {
            scale:    1,
            filter:   'blur(0px)',
            duration: 1.25,
            ease:     'power4.out',
            delay:    delay,
            onComplete: function () {
              gsap.set( img, { clearProps: 'filter,transform' } );
            },
          } );
        }

        if ( content.length ) {
          gsap.to( content, {
            autoAlpha: 1,
            y:         0,
            duration:  0.7,
            ease:      'power3.out',
            stagger:   0.12,
            delay:     delay + 0.12,
            onComplete: function () {
              gsap.set( content, { clearProps: 'visibility,opacity,transform' } );
            },
          } );
        }
      } );

      if ( pagination ) {
        gsap.to( pagination, {
          autoAlpha: 1,
          y:         0,
          duration:  0.55,
          ease:      'power3.out',
          delay:     0.38,
          onComplete: function () {
            gsap.set( pagination, { clearProps: 'visibility,opacity,transform' } );
          },
        } );
      }
    }

    entranceTrigger = ScrollTrigger.create( {
      trigger:     mobile,
      start:       'top 78%',
      once:        true,
      onEnter:     playEntrance,
      onEnterBack: playEntrance,
    } );

    window.requestAnimationFrame( function () {
      var rect = mobile.getBoundingClientRect();
      if ( rect.top < window.innerHeight * 0.82 && rect.bottom > 0 ) {
        playEntrance();
      }
    } );
  }

  initMobileRitualEntrance();
  swiper.update();
} )();

/* ===== size chips ===== */
( function () {
  'use strict';

  document.addEventListener( 'click', function ( event ) {
    var chip = event.target.closest( '.lumea-size-chip' );
    if ( ! chip ) return;

    var row = chip.closest( '.lumea-size-row' );
    if ( ! row ) return;

    var wasSelected = chip.classList.contains( 'is-selected' );
    row.querySelectorAll( '.lumea-size-chip.is-selected' ).forEach( function ( el ) {
      el.classList.remove( 'is-selected' );
      el.setAttribute( 'aria-pressed', 'false' );
    } );

    if ( ! wasSelected ) {
      chip.classList.add( 'is-selected' );
      chip.setAttribute( 'aria-pressed', 'true' );
    }
  } );
} )();

/* ===== home faq ===== */
( function () {
  'use strict';

  var sections = Array.prototype.slice.call( document.querySelectorAll( '[data-lumea-home-faq]' ) );
  if ( ! sections.length ) return;

  sections.forEach( function ( section ) {
    var items = Array.prototype.slice.call( section.querySelectorAll( '.lumea-home-faq-item' ) );
    if ( ! items.length ) return;

    function setItem( item, open ) {
      item.classList.toggle( 'is-open', open );
      var button = item.querySelector( '.lumea-home-faq-question' );
      if ( button ) button.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
    }

    items.forEach( function ( item ) {
      setItem( item, item.classList.contains( 'is-open' ) );

      var button = item.querySelector( '.lumea-home-faq-question' );
      if ( ! button ) return;

      button.addEventListener( 'click', function () {
        var shouldOpen = ! item.classList.contains( 'is-open' );
        items.forEach( function ( otherItem ) {
          setItem( otherItem, otherItem === item ? shouldOpen : false );
        } );
      } );
    } );
  } );
} )();

/* ===== blog scroll-spy ===== */
( function () {
  'use strict';

  var section = document.querySelector( '[data-lumea-blog]' );
  if ( ! section ) return;

  var rows = Array.prototype.slice.call( section.querySelectorAll( '.lumea-blog-scroll-row' ) );
  var panels = Array.prototype.slice.call( section.querySelectorAll( '.lumea-blog-panel' ) );
  if ( rows.length < 2 || panels.length < 2 ) return;

  function setActive( index ) {
    rows.forEach( function ( row, i ) {
      row.classList.toggle( 'is-active', i === index );
    } );
    panels.forEach( function ( panel, i ) {
      panel.classList.toggle( 'is-active', i === index );
    } );
  }

  if ( window.matchMedia( '(min-width: 992px)' ).matches ) {
    // Pick whichever row's center is closest to the viewport's center —
    // deterministic (exactly one winner every time), so it can't get
    // stuck between two rows the way a narrow IntersectionObserver
    // band can when their edges both graze the trigger zone at once.
    var ticking = false;

    function updateActiveByPosition() {
      ticking = false;
      var viewportCenter = window.innerHeight / 2;
      var closestIndex = 0;
      var closestDistance = Infinity;

      rows.forEach( function ( row, i ) {
        var rect = row.getBoundingClientRect();
        var rowCenter = rect.top + rect.height / 2;
        var distance = Math.abs( rowCenter - viewportCenter );
        if ( distance < closestDistance ) {
          closestDistance = distance;
          closestIndex = i;
        }
      } );

      setActive( closestIndex );
    }

    function requestUpdate() {
      if ( ticking ) return;
      ticking = true;
      window.requestAnimationFrame( updateActiveByPosition );
    }

    window.addEventListener( 'scroll', requestUpdate, { passive: true } );
    window.addEventListener( 'resize', requestUpdate );
    requestUpdate();
  }

  rows.forEach( function ( row, i ) {
    row.addEventListener( 'click', function ( event ) {
      if ( row.getAttribute( 'href' ) === '#' ) {
        event.preventDefault();
      }
      setActive( i );
    } );
  } );
} )();
