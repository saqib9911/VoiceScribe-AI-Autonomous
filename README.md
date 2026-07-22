# VoiceScribe AI Autonomous - Enterprise PWA

VoiceScribe AI is a fully autonomous, offline-capable Progressive Web Application (PWA) designed for enterprise-level real-time audio transcription, smart summarization, and secure data logging. Built entirely with Vanilla JavaScript, HTML5, and CSS3, it requires no backend servers and processes everything securely on the client side.

## 🚀 Key Features

* **Continuous Transcription:** Uses Web Speech API with an auto-restart watchdog to prevent timeouts during long meetings or lectures.
* **Autonomous AI Summarization:** Generates automated action items and summaries locally.
* **Secure Vault (PIN Locked):** All sessions are stored locally in the browser using IndexedDB, protected by a user-defined Master PIN.
* **Neural Noise Filtering:** Implements Web Audio API Biquad Filters to isolate human vocal frequencies and suppress background noise.
* **Smart Diarization & Keyword Highlighting:** Automatically formats speaker shifts and highlights critical keywords (e.g., *Urgent, Deadline, Boss*).
* **Multi-Format Export Hub:** Export generated transcripts directly to **PDF**, **DOCX**, or **TXT** formats.
* **Offline Ready:** Implements Service Workers for 100% offline capability after the first load.

## 📁 File Structure

The project is contained in a single directory with zero build steps required:

- `index.html` - Core UI and application layout.
- `style.css` - Modern, dark-themed responsive design.
- `app.js` - Main application logic, audio processing, and IndexedDB management.
- `manifest.json` - PWA configuration for desktop and mobile installation.
- `sw.js` - Service Worker for asset caching and offline functionality.
- `icon-512.png` - App icon (Add your own 512x512 icon file in the root folder).

## 🛠️ Installation & Usage

Since this application utilizes advanced browser APIs (`MediaRecorder`, `AudioContext`, and `Service Workers`), it must be served over a secure context (`localhost` or `https`).

### Running Locally (via PyCharm or Terminal)

1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/voicescribe-ai.git](https://github.com/yourusername/voicescribe-ai.git)
   cd voicescribe-ai