// ScrollMark - Popup Script (Full Control Panel)

document.addEventListener('DOMContentLoaded', () => {
  const btnSet = document.getElementById('btn-set');
  const btnJump = document.getElementById('btn-jump');
  const btnToggleScroll = document.getElementById('btn-toggle-scroll');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const scrollPct = document.getElementById('scroll-pct');
  const bookmarkList = document.getElementById('bookmark-list');
  const bookmarksTitle = document.getElementById('bookmarks-title');
  const toast = document.getElementById('toast');

  let currentState = null;

  // --- TOAST ---
  function showToast(msg) {
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1200);
    }
  }

  // --- TAB COMMUNICATION ---
  function sendToTab(action, extra = {}) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) return reject('No active tab');
        const tabId = tabs[0].id;

        chrome.tabs.sendMessage(tabId, { action, ...extra })
          .then(resolve)
          .catch(() => {
            // Content script not loaded — inject it first
            chrome.scripting.executeScript({
              target: { tabId },
              files: ['content.js']
            }).then(() => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action, ...extra })
                  .then(resolve)
                  .catch(reject);
              }, 150);
            }).catch(reject);
          });
      });
    });
  }

  // --- RENDER STATE ---
  function renderState(data) {
    currentState = data;

    // Scroll progress
    if (scrollPct) {
      scrollPct.textContent = `${data.scrollPercent || 0}%`;
    }

    // Auto-scroll toggle
    if (btnToggleScroll) {
      if (data.isAutoScrolling) {
        btnToggleScroll.classList.add('active');
        btnToggleScroll.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      } else {
        btnToggleScroll.classList.remove('active');
        btnToggleScroll.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
      }
    }

    // Speed slider
    if (speedSlider) {
      speedSlider.value = data.autoScrollSpeed || 1.5;
    }
    if (speedValue) {
      speedValue.textContent = `${data.autoScrollSpeed || 1.5}x`;
    }

    // Jump button state
    if (btnJump) {
      if (!data.anchors || data.anchors.length === 0) {
        btnJump.classList.add('disabled');
      } else {
        btnJump.classList.remove('disabled');
      }
    }

    // Bookmarks
    if (bookmarksTitle) {
      bookmarksTitle.textContent = `Bookmarks (${data.anchors ? data.anchors.length : 0})`;
    }

    if (bookmarkList) {
      if (!data.anchors || data.anchors.length === 0) {
        bookmarkList.innerHTML = `<div class="no-bookmarks">No marks set yet. Press Alt+S!</div>`;
      } else {
        bookmarkList.innerHTML = data.anchors.map(a => `
          <div class="bookmark-item" data-id="${a.id}">
            <div class="bookmark-label" data-action="jump" data-id="${a.id}" title="Jump to this mark">
              <div class="bookmark-name">${escapeHTML(a.name)}</div>
              <div class="bookmark-desc">${a.percentage}% scroll (${Math.round(a.scrollY)}px)</div>
            </div>
            <div class="bookmark-actions">
              <button class="bk-btn bk-btn-go" data-action="jump" data-id="${a.id}" title="Jump">
                <svg viewBox="0 0 24 24" fill="none"><polyline points="18 15 12 9 6 15"></polyline></svg>
              </button>
              <button class="bk-btn bk-btn-del" data-action="delete" data-id="${a.id}" title="Delete">
                <svg viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        `).join('');

        // Attach bookmark click handlers
        bookmarkList.querySelectorAll('[data-action="jump"]').forEach(el => {
          el.addEventListener('click', () => {
            const id = parseInt(el.dataset.id);
            sendToTab('jump-to-anchor', { id }).then(() => showToast('Jumped!'));
          });
        });

        bookmarkList.querySelectorAll('[data-action="delete"]').forEach(el => {
          el.addEventListener('click', () => {
            const id = parseInt(el.dataset.id);
            sendToTab('delete-anchor', { id }).then(resp => {
              showToast('Deleted');
              if (resp) renderState({ ...currentState, anchors: resp.anchors || [] });
              else refreshState();
            });
          });
        });
      }
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- REFRESH STATE FROM CONTENT SCRIPT ---
  function refreshState() {
    sendToTab('get-state').then(renderState).catch(() => {
      // Content script not loaded — show defaults
      renderState({
        anchors: [],
        isAutoScrolling: false,
        autoScrollSpeed: 1.5,
        scrollPercent: 0
      });
    });
  }

  // --- EVENT HANDLERS ---
  if (btnSet) {
    btnSet.addEventListener('click', () => {
      sendToTab('set-mark').then(() => {
        showToast('Mark Set!');
        setTimeout(refreshState, 100);
      });
    });
  }

  if (btnJump) {
    btnJump.addEventListener('click', () => {
      if (btnJump.classList.contains('disabled')) return;
      sendToTab('jump-to-mark').then(() => showToast('Jumped!'));
    });
  }

  if (btnToggleScroll) {
    btnToggleScroll.addEventListener('click', () => {
      sendToTab('toggle-autoscroll').then(resp => {
        if (resp) {
          renderState({ ...currentState, isAutoScrolling: resp.isAutoScrolling });
        }
      });
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      if (speedValue) {
        speedValue.textContent = `${speed}x`;
      }
      sendToTab('set-speed', { speed });
    });
  }



  // --- POLL FOR SCROLL PROGRESS WHILE POPUP IS OPEN ---
  let pollInterval = setInterval(() => {
    sendToTab('get-state').then(data => {
      if (data) {
        if (scrollPct) {
          scrollPct.textContent = `${data.scrollPercent || 0}%`;
        }
        // Update auto-scroll state if it changed
        if (currentState && data.isAutoScrolling !== currentState.isAutoScrolling) {
          renderState({ ...currentState, ...data });
        }
      }
    }).catch(() => {});
  }, 1000);

  // Clean up on popup close
  window.addEventListener('unload', () => clearInterval(pollInterval));

  // --- INITIAL LOAD ---
  refreshState();
});
