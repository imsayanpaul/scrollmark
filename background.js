// Background service worker for ScrollMark extension
// Listens for browser-wide commands (keyboard shortcuts) and forwards them to the active tab.
// If the content script is not yet running on the active tab, it programmatically injects it first.

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      const tabId = tabs[0].id;
      
      // Try sending the command to the content script
      chrome.tabs.sendMessage(tabId, { action: command })
        .then(response => {
          console.log(`ScrollMark command "${command}" delivered:`, response);
        })
        .catch((err) => {
          console.warn("ScrollMark: Content script not active on this tab yet. Injecting programmatically...", err.message);
          
          // Programmatically inject content.js if it is not loaded yet (e.g., on pre-existing tabs)
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }).then(() => {
            // Wait slightly for script initialization, then retry sending the keyboard command
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { action: command }).catch(retryErr => {
                console.error("ScrollMark: Failed to send command post-injection (e.g. protected browser tab):", retryErr.message);
              });
            }, 100);
          }).catch(injectErr => {
            console.error("ScrollMark: Failed to inject script on this tab (e.g., chrome:// page or Chrome Web Store):", injectErr.message);
          });
        });
    }
  });
});
