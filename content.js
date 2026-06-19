// ScrollMark - Content Script (No HUD — popup-only control)

(function () {
  // --- RELOAD CLEANUP ---
  const oldHost = document.getElementById('scrollmark-shadow-host');
  if (oldHost) {
    try { oldHost.remove(); } catch (e) {}
  }

  if (window.ScrollMarkMessageListener) {
    try { chrome.runtime.onMessage.removeListener(window.ScrollMarkMessageListener); } catch (e) {}
  }
  if (window.ScrollMarkScrollListener) {
    try { window.removeEventListener('scroll', window.ScrollMarkScrollListener, true); } catch (e) {}
  }

  // --- STATE MANAGEMENT ---
  let state = {
    anchors: [],
    lastAnchorY: null,
    lastAnchorSelector: null,
    lastAnchorNodeSelector: null,
    lastAnchorElementOffset: null,
    isAutoScrolling: false,
    autoScrollSpeed: 1.5
  };

  const STORAGE_KEY = `scrollmark_data_${encodeURIComponent(window.location.href)}`;
  let activeScrollElement = null;

  // --- HELPER FUNCTIONS ---

  function waitForElement(selector, maxWaitMs, callback) {
    const startTime = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) {
        callback(el);
      } else if (Date.now() - startTime < maxWaitMs) {
        setTimeout(check, 30);
      } else {
        callback(null);
      }
    };
    check();
  }

  function alignNodeIteratively(container, targetNode, offset, callback) {
    const maxIterations = 8;
    let iteration = 0;
    const step = () => {
      const isWin = container === window;
      const containerRect = isWin ? { top: 0, left: 0 } : container.getBoundingClientRect();
      const nodeRect = targetNode.getBoundingClientRect();
      const currentOffset = nodeRect.top - containerRect.top;
      const diff = currentOffset - offset;
      if (Math.abs(diff) > 0.5 && iteration < maxIterations) {
        iteration++;
        if (isWin) {
          window.scrollBy({ top: diff, behavior: 'instant' });
        } else {
          container.scrollBy({ top: diff, behavior: 'instant' });
        }
        requestAnimationFrame(step);
      } else {
        if (callback) callback();
      }
    };
    step();
  }

  function getScrollableElement() {
    if (activeScrollElement && isElementScrollable(activeScrollElement)) {
      return activeScrollElement;
    }
    const docEl = document.documentElement;
    const body = document.body;
    if (docEl.scrollHeight > docEl.clientHeight + 10) return window;
    if (body.scrollHeight > body.clientHeight + 10) return window;

    let bestElem = window;
    let maxArea = 0;
    for (const el of document.querySelectorAll('*')) {
      let overflowY = '';
      try {
        const style = window.getComputedStyle(el);
        overflowY = style ? style.overflowY : '';
      } catch (e) { continue; }
      const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
      if (isScrollable && el.scrollHeight > el.clientHeight + 5) {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea && rect.height > 100 && rect.width > 100) {
          maxArea = area;
          bestElem = el;
        }
      }
    }
    activeScrollElement = bestElem;
    return bestElem;
  }

  function isElementScrollable(el) {
    if (el === window) return true;
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    let overflowY = '';
    try {
      const style = window.getComputedStyle(el);
      overflowY = style ? style.overflowY : '';
    } catch (e) { return false; }
    return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
  }

  function getUniqueSelector(el) {
    if (el === window) return "window";
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return "window";
    if (el.id && !el.id.includes(':') && !el.id.includes('.') && !el.id.includes('[')) {
      return `#${el.id}`;
    }
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      if (current.nodeName.toLowerCase() === 'body') { path.unshift('body'); break; }
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.nodeName === current.nodeName) index++;
        sibling = sibling.previousElementSibling;
      }
      path.unshift(`${current.nodeName.toLowerCase()}:nth-of-type(${index})`);
      current = current.parentNode;
    }
    return path.join(' > ');
  }

  function getElementBySelector(selector) {
    if (!selector || selector === "window") return window;
    try { return document.querySelector(selector) || window; }
    catch (e) { return window; }
  }

  function getScrollState() {
    const el = getScrollableElement();
    if (el === window) {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      return { element: window, currentY: window.scrollY, scrollHeight: document.documentElement.scrollHeight, clientHeight: window.innerHeight, maxScroll: maxScroll > 0 ? maxScroll : 1, isWindow: true };
    } else {
      const maxScroll = el.scrollHeight - el.clientHeight;
      return { element: el, currentY: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, maxScroll: maxScroll > 0 ? maxScroll : 1, isWindow: false };
    }
  }

  function scrollToYOnElement(el, targetY, smooth = true) {
    const behavior = smooth ? 'smooth' : 'instant';
    if (el === window) {
      window.scrollTo({ top: targetY, behavior });
    } else {
      el.scrollTo({ top: targetY, behavior });
    }
  }

  function scrollByY(amount) {
    const el = getScrollableElement();
    if (el === window) {
      window.scrollBy({ top: amount, behavior: 'instant' });
    } else {
      el.scrollBy({ top: amount, behavior: 'instant' });
    }
  }

  // --- STATE PERSISTENCE ---
  function saveState() {
    try {
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          anchors: state.anchors,
          autoScrollSpeed: state.autoScrollSpeed
        }
      });
    } catch (e) { console.error(e); }
  }

  function loadState(callback) {
    try {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const savedData = result[STORAGE_KEY];
        if (savedData) {
          state.anchors = savedData.anchors || [];
          state.autoScrollSpeed = savedData.autoScrollSpeed || 1.5;
          if (state.anchors.length > 0) {
            const last = state.anchors[state.anchors.length - 1];
            state.lastAnchorY = last.scrollY;
            state.lastAnchorSelector = last.selector;
            state.lastAnchorNodeSelector = last.nodeSelector;
            state.lastAnchorElementOffset = last.elementOffset;
          }
        }
        if (callback) callback();
      });
    } catch (e) {
      console.error(e);
      if (callback) callback();
    }
  }

  // --- PAGE CSS (marker line + bubble) ---
  const PAGE_CSS = `
    .scrollmark-marker-line {
      pointer-events: none;
      z-index: 2147483645;
      opacity: 1;
      transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      height: 2px;
      background: linear-gradient(90deg, rgba(249, 115, 22, 0) 0%, rgba(249, 115, 22, 0.95) 15%, rgba(249, 115, 22, 0.95) 85%, rgba(249, 115, 22, 0) 100%);
      box-shadow: 0 0 10px rgba(249, 115, 22, 0.8), 0 0 20px rgba(249, 115, 22, 0.4);
    }
    .scrollmark-pulse-indicator {
      background: #09090b;
      color: #ffffff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-weight: 500;
      border: 1px solid #27272a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      z-index: 2147483646;
      opacity: 1;
      transition: opacity 0.6s ease;
    }
  `;

  function injectPageCSS() {
    const styleId = 'scrollmark-page-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = PAGE_CSS;
      document.head.appendChild(style);
    }
  }

  // --- CORE ACTIONS ---

  // 1. Set Scroll Mark
  function setScrollMark() {
    const sState = getScrollState();
    const scrollY = sState.currentY;
    const percentage = Math.round((scrollY / sState.maxScroll) * 100);
    const selector = getUniqueSelector(sState.element);

    let nodeSelector = "window";
    let elementOffset = 0;

    try {
      const container = sState.element;
      const isWin = container === window;
      const rect = isWin
        ? { left: 0, width: window.innerWidth, top: 0, height: window.innerHeight }
        : container.getBoundingClientRect();

      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      let targetNode = document.elementFromPoint(centerX, centerY);

      if (targetNode) {
        const blockTags = ['div', 'p', 'section', 'article', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'pre', 'blockquote'];
        const parentLimit = isWin ? document.body : container;
        while (targetNode && targetNode.parentNode && targetNode.parentNode !== parentLimit) {
          if (blockTags.includes(targetNode.nodeName.toLowerCase())) break;
          targetNode = targetNode.parentNode;
        }
        nodeSelector = getUniqueSelector(targetNode);
        const elemRect = targetNode.getBoundingClientRect();
        elementOffset = elemRect.top - rect.top;
      }
    } catch (e) {
      console.warn("ScrollMark: Failed to find semantic center node", e);
    }

    const anchorName = `Mark ${state.anchors.length + 1} (${percentage}%)`;
    const newAnchor = {
      id: Date.now(),
      name: anchorName,
      scrollY, percentage, selector,
      nodeSelector, elementOffset
    };

    state.anchors.push(newAnchor);
    state.lastAnchorY = scrollY;
    state.lastAnchorSelector = selector;
    state.lastAnchorNodeSelector = nodeSelector;
    state.lastAnchorElementOffset = elementOffset;
    saveState();
    showIndicatorLine(sState.element, scrollY, `Mark Anchored!`);
  }

  // 2. Jump to Scroll Mark
  function alignNodeToOffset(container, targetNode, offset, useSmooth) {
    const isWin = container === window;
    const getTargetScrollY = () => {
      const currentScrollTop = isWin ? window.scrollY : container.scrollTop;
      const containerRect = isWin ? { top: 0, left: 0 } : container.getBoundingClientRect();
      const nodeRect = targetNode.getBoundingClientRect();
      return currentScrollTop + (nodeRect.top - containerRect.top) - offset;
    };

    const targetY = getTargetScrollY();
    scrollToYOnElement(container, targetY, useSmooth);

    if (useSmooth) {
      let didCorrect = false;
      const doCorrection = () => {
        if (didCorrect) return;
        didCorrect = true;
        alignNodeIteratively(container, targetNode, offset);
      };
      const onScrollEnd = () => {
        window.removeEventListener('scrollend', onScrollEnd);
        doCorrection();
      };
      window.addEventListener('scrollend', onScrollEnd);
      setTimeout(() => {
        window.removeEventListener('scrollend', onScrollEnd);
        doCorrection();
      }, 750);
    } else {
      alignNodeIteratively(container, targetNode, offset);
    }
  }

  function jumpToScrollMark(targetY = null, targetSelector = null, targetNodeSelector = null, targetElementOffset = null) {
    let y = targetY, selector = targetSelector, nodeSelector = targetNodeSelector, elementOffset = targetElementOffset;
    if (y === null) {
      if (state.lastAnchorY === null) return;
      y = state.lastAnchorY;
      selector = state.lastAnchorSelector;
      nodeSelector = state.lastAnchorNodeSelector;
      elementOffset = state.lastAnchorElementOffset;
    }

    const wasScrolling = state.isAutoScrolling;
    if (wasScrolling) toggleAutoScroll(false);

    const el = getElementBySelector(selector);
    activeScrollElement = el;
    const isWin = el === window;
    const currentScrollTop = isWin ? window.scrollY : el.scrollTop;
    const useSmooth = !wasScrolling && Math.abs(currentScrollTop - y) <= 1200;

    const onLanding = (ok) => {
      showIndicatorLine(el, y, ok ? "Landing at Mark" : "Landing at Mark (Fallback)");
      if (wasScrolling) setTimeout(() => toggleAutoScroll(true), 350);
    };

    if (nodeSelector && nodeSelector !== "window" && elementOffset !== null) {
      const initialNode = document.querySelector(nodeSelector);
      if (initialNode) {
        alignNodeToOffset(el, initialNode, elementOffset, useSmooth);
        onLanding(true);
      } else {
        scrollToYOnElement(el, y, false);
        waitForElement(nodeSelector, 500, (targetNode) => {
          if (targetNode) {
            alignNodeIteratively(el, targetNode, elementOffset);
            onLanding(true);
          } else {
            scrollToYOnElement(el, y, false);
            onLanding(false);
          }
        });
      }
    } else {
      scrollToYOnElement(el, y, useSmooth);
      if (useSmooth) {
        let didCorrect = false;
        const doCorrection = () => { if (didCorrect) return; didCorrect = true; scrollToYOnElement(el, y, false); };
        const onScrollEnd = () => { window.removeEventListener('scrollend', onScrollEnd); doCorrection(); };
        window.addEventListener('scrollend', onScrollEnd);
        setTimeout(() => { window.removeEventListener('scrollend', onScrollEnd); doCorrection(); }, 750);
      }
      onLanding(false);
    }
  }

  // 3. Delete Scroll Mark
  function deleteScrollMark(id) {
    state.anchors = state.anchors.filter(a => a.id !== id);
    if (state.anchors.length > 0) {
      const last = state.anchors[state.anchors.length - 1];
      state.lastAnchorY = last.scrollY;
      state.lastAnchorSelector = last.selector;
      state.lastAnchorNodeSelector = last.nodeSelector;
      state.lastAnchorElementOffset = last.elementOffset;
    } else {
      state.lastAnchorY = null;
      state.lastAnchorSelector = null;
      state.lastAnchorNodeSelector = null;
      state.lastAnchorElementOffset = null;
    }
    saveState();
  }

  // 4. Auto-Scroll
  function toggleAutoScroll(forceState = null) {
    const target = forceState !== null ? forceState : !state.isAutoScrolling;
    if (target === state.isAutoScrolling) return;
    state.isAutoScrolling = target;
    if (state.isAutoScrolling) requestAnimationFrame(autoScrollLoop);
  }

  function autoScrollLoop() {
    if (!state.isAutoScrolling) return;
    scrollByY(state.autoScrollSpeed);
    const sState = getScrollState();
    if (sState.currentY >= sState.maxScroll - 1) {
      toggleAutoScroll(false);
    } else {
      requestAnimationFrame(autoScrollLoop);
    }
  }

  // 5. Visual Indicator Line
  function showIndicatorLine(container, yOffset, message) {
    document.querySelectorAll('.scrollmark-marker-line, .scrollmark-pulse-indicator').forEach(el => el.remove());

    const isWin = container === window;
    const rect = isWin
      ? { left: 0, width: window.innerWidth, top: 0, height: window.innerHeight }
      : container.getBoundingClientRect();

    const midY = rect.top + (rect.height / 2);
    const midX = rect.left + (rect.width / 2);

    const line = document.createElement('div');
    line.className = 'scrollmark-marker-line';
    line.style.cssText = `position:fixed; left:${rect.left}px; width:${rect.width}px; top:${midY}px; transform:translateY(-50%);`;
    document.body.appendChild(line);

    const bubble = document.createElement('div');
    bubble.className = 'scrollmark-pulse-indicator';
    bubble.style.cssText = `position:fixed; left:${midX}px; top:${midY}px; transform:translate(-50%,-50%);`;
    bubble.textContent = message;
    document.body.appendChild(bubble);

    setTimeout(() => {
      line.style.opacity = '0';
      bubble.style.opacity = '0';
      setTimeout(() => { line.remove(); bubble.remove(); }, 1000);
    }, 1800);
  }

  // --- SCROLL LISTENER ---
  const scrollListener = (e) => {
    const scrolledEl = e.target === document ? window : e.target;
    if (isElementScrollable(scrolledEl)) {
      activeScrollElement = scrolledEl;
    }
  };
  window.ScrollMarkScrollListener = scrollListener;
  window.addEventListener('scroll', window.ScrollMarkScrollListener, true);

  // --- MESSAGING WITH POPUP / BACKGROUND ---
  const messageListener = (message, sender, sendResponse) => {
    if (message.action === "set-mark") {
      setScrollMark();
      sendResponse({ status: "success" });
    } else if (message.action === "jump-to-mark") {
      if (state.anchors.length > 0) {
        const last = state.anchors[state.anchors.length - 1];
        jumpToScrollMark(last.scrollY, last.selector, last.nodeSelector, last.elementOffset);
      }
      sendResponse({ status: "success" });
    } else if (message.action === "toggle-autoscroll") {
      toggleAutoScroll();
      sendResponse({ status: "success", isAutoScrolling: state.isAutoScrolling });
    } else if (message.action === "set-speed") {
      state.autoScrollSpeed = parseFloat(message.speed) || 1.5;
      saveState();
      sendResponse({ status: "success" });
    } else if (message.action === "get-state") {
      const sState = getScrollState();
      const pct = Math.round((sState.currentY / sState.maxScroll) * 100);
      sendResponse({
        status: "success",
        anchors: state.anchors,
        isAutoScrolling: state.isAutoScrolling,
        autoScrollSpeed: state.autoScrollSpeed,
        scrollPercent: pct
      });
    } else if (message.action === "jump-to-anchor") {
      const anchor = state.anchors.find(a => a.id === message.id);
      if (anchor) {
        jumpToScrollMark(anchor.scrollY, anchor.selector, anchor.nodeSelector, anchor.elementOffset);
      }
      sendResponse({ status: "success" });
    } else if (message.action === "delete-anchor") {
      deleteScrollMark(message.id);
      sendResponse({ status: "success", anchors: state.anchors });
    }
    return true; // keep channel open for async
  };

  window.ScrollMarkMessageListener = messageListener;
  chrome.runtime.onMessage.addListener(window.ScrollMarkMessageListener);

  // --- INIT ---
  loadState(() => {
    injectPageCSS();
  });
})();
