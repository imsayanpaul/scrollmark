# ScrollMark 🎯

ScrollMark is a lightweight, high-performance Chrome extension designed to anchor your exact reading position on any webpage and return to it instantly with a simple keyboard shortcut or click. 

Unlike generic scroll-saving extensions, ScrollMark is custom-built to handle complex, dynamic single-page applications (SPAs) like **ChatGPT, Gemini, and Grok** by anchoring to the nearest semantic DOM elements rather than raw pixel offsets.

---

## 📺 Demo & Preview

<p align="center">
  <img src="public%20img/ss.png" alt="ScrollMark Extension Preview" width="320">
</p>

<p align="center">
  <img src="public%20img/video_demo.gif" alt="ScrollMark Video Demo" width="600">
</p>

---

## 💡 The Origin Story
Built during study breaks for exams. When reading long study materials or logs and scrolling down to ask counter-questions in ChatGPT, losing the scroll position and having to find the place again was a constant disruption. ScrollMark solves this by letting you bookmark your exact paragraph, scroll down to chat/ask questions, and instantly teleport right back.

---

## 🚀 Features

- **Semantic DOM Anchoring**: Remembers the actual text block/paragraph you were reading so that it aligns correctly even if the layout shifts or dynamic content loads.
- **Dynamic Container Support**: Works on websites with custom scroll panels (e.g. ChatGPT chat feeds, Gemini, Grok) where normal scroll extensions fail.
- **CSP-Compliant Native Storage**: Uses `chrome.storage.local` to bypass host-page security policies (Content Security Policy) and prevent tracking/pollution of page storage.
- **Minimalist Dark Theme**: Styled with a Vercel/Stripe-inspired dark aesthetic featuring smooth transitions and micro-animations.
- **Hands-Free Auto-Scroll**: Built-in adjustable speed autoscrolling for relaxed reading.

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut (Windows/Mac) |
| :--- | :--- |
| **Set Scroll Mark** | `Alt + S` |
| **Jump to Scroll Mark** | `Alt + J` |
| **Toggle Auto-Scroll** | `Alt + A` |

---

## 🛠️ Installation

1. **Clone/Download** this repository to your local machine.
2. Open Chrome (or any Chromium browser) and go to `chrome://extensions`.
3. Toggle the **"Developer mode"** switch in the top-right corner to **ON**.
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select the folder containing these files.
6. Pin **ScrollMark** to your toolbar and start reading!

---

## 📂 Project Structure

- `manifest.json`: Extension settings, permissions, background worker, and hotkeys.
- `popup.html` & `popup.js`: The control panel interface.
- `content.js`: Handles scroll position calculations, visual line indicators, and message events.
- `background.js`: Listens for browser-wide keyboard commands and forwards them.
- `icon*.png`: Extension logo assets.
