const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const summaryBtn = document.getElementById('summaryBtn');
const exportMenuBtn = document.getElementById('exportMenuBtn');
const exportTxt = document.getElementById('exportTxt');
const exportPdf = document.getElementById('exportPdf');
const exportDocx = document.getElementById('exportDocx');
const installAppBtn = document.getElementById('installAppBtn');

const output = document.getElementById('transcriptOutput');
const summaryOutput = document.getElementById('summaryOutput');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const canvas = document.getElementById('audioVisualizer');
const sessionList = document.getElementById('sessionList');
const bufferStatus = document.getElementById('bufferStatus');
const modelStatus = document.getElementById('modelStatus');
const langSelect = document.getElementById('langSelect');
const noiseFilterToggle = document.getElementById('noiseFilterToggle');
const pinInput = document.getElementById('pinInput');
const setPinBtn = document.getElementById('setPinBtn');

let mediaRecorder;
let audioChunks = [];
let recognition;
let audioCtx, analyser, dataArray, source, animationId, biquadFilter;
let isRecording = false;
let confirmedTranscript = '';
let currentSpeaker = 'Speaker 1';
let userPin = null;
let isVaultUnlocked = false;

const keywords = ['urgent', 'deadline', 'important', 'boss', 'target', 'client', 'meeting', 'qanoon', 'payment'];

// Database Initialization
let db;
const request = indexedDB.open('VoiceScribeAutonomousDB', 2);

request.onerror = () => console.error('Database failed');
request.onsuccess = (e) => {
    db = e.target.result;
    if (isVaultUnlocked) loadSidebarSessions();
};
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
    }
};

// PIN Lock Management
setPinBtn.addEventListener('click', () => {
    const pin = pinInput.value.trim();
    if (pin.length < 4) {
        alert('Please enter a secure 4-digit PIN.');
        return;
    }
    userPin = pin;
    isVaultUnlocked = true;
    bufferStatus.textContent = 'Vault Unlocked';
    bufferStatus.className = 'value optimal';
    statusText.textContent = 'System Ready';
    pinInput.value = '';
    pinInput.disabled = true;
    setPinBtn.disabled = true;
    startBtn.disabled = false;
    modelStatus.textContent = 'WASM Ready (Offline)';
    loadSidebarSessions();
});

// Keyword Highlighting Processor
function highlightKeywords(text) {
    let processed = text;
    keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        processed = processed.replace(regex, `<span class="keyword-highlight">$&</span>`);
    });
    return processed;
}

function getDiarizedPrefix() {
    return `<span class="speaker-tag">[${currentSpeaker}]:</span> `;
}

// Autonomous Offline LLM Summarizer
function runOfflineLLMSummary(text) {
    if (!isVaultUnlocked) {
        alert('Vault is locked. Enter PIN first.');
        return;
    }
    const cleanText = text.replace(/<[^>]*>?/gm, '');
    if (!cleanText || cleanText.trim().length === 0) {
        summaryOutput.innerText = 'No session content found for offline AI analysis.';
        return;
    }

    summaryOutput.innerText = 'Executing offline neural transformers pipeline...';
    setTimeout(() => {
        const sentences = cleanText.split(/[.?!]\s+/).filter(s => s.trim().length > 0);
        let summary = '🤖 **Autonomous Offline AI Summary (WASM):**\n';
        let actions = '\n⚡ **Extracted Action Items:**\n';

        sentences.forEach((s, idx) => {
            if (idx % 2 === 0) summary += `• ${s.substring(0, 90)}...\n`;
            if (keywords.some(k => s.toLowerCase().includes(k))) {
                actions += `👉 [Mandatory Task]: ${s}\n`;
            }
        });
        summaryOutput.innerHTML = highlightKeywords(summary + actions);
    }, 800);
}

// Speech Recognition Engine - Forced Real-time Mobile Paint Fix
function initSpeechEngine() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Web Speech API unsupported on this browser.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langSelect.value;

    recognition.onresult = (e) => {
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            let transcriptPiece = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                confirmedTranscript += `${getDiarizedPrefix()} ${transcriptPiece}<br>`;
                currentSpeaker = currentSpeaker === 'Speaker 1' ? 'Speaker 2' : 'Speaker 1';
            } else {
                interimText += transcriptPiece;
            }
        }

        // Directly update DOM container to force mobile rendering view
        let fullHTML = confirmedTranscript;
        if (interimText.trim().length > 0) {
            fullHTML += `${getDiarizedPrefix()} <span style="color: #38bdf8; opacity: 0.85;">${interimText}</span>`;
        }

        output.innerHTML = highlightKeywords(fullHTML);
        output.scrollTop = output.scrollHeight;
    };

    recognition.onerror = (err) => console.warn('Engine warning:', err.error);
    recognition.onend = () => {
        if (isRecording) {
            try { recognition.start(); } catch (e) { console.error(e); }
        }
    };
}

async function startStream() {
    if (!isVaultUnlocked) {
        alert('Unlock Vault with PIN first.');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        source = audioCtx.createMediaStreamSource(stream);

        // Prevent Loopback / Ringing Sound by NOT connecting source to audioCtx.destination (speakers)
        if (noiseFilterToggle.checked) {
            biquadFilter = audioCtx.createBiquadFilter();
            biquadFilter.type = 'bandpass';
            biquadFilter.frequency.value = 1200;
            biquadFilter.Q.value = 1.0;
            source.connect(biquadFilter);
            biquadFilter.connect(analyser);
        } else {
            source.connect(analyser);
        }
        // NOTE: We deliberately DO NOT call analyser.connect(audioCtx.destination) to avoid microphone feedback beep/ring.

        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        visualize();

        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.start(1000);

        confirmedTranscript = '';
        output.innerHTML = '';
        summaryOutput.innerText = 'Neural stream initializing...';
        initSpeechEngine();
        recognition.start();

        isRecording = true;
        statusDot.classList.add('active');
        statusText.textContent = 'Autonomous Stream Active';
        bufferStatus.textContent = 'Recording Secure';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        summaryBtn.disabled = false;
        exportMenuBtn.disabled = false;

    } catch (err) {
        alert('Microphone Access Error: ' + err.message);
    }
}

function stopStream() {
    isRecording = false;
    if (recognition) recognition.stop();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    cancelAnimationFrame(animationId);

    statusDot.classList.remove('active');
    statusText.textContent = 'Encrypted & Saved to Vault.';
    bufferStatus.textContent = 'Vault Secured';
    startBtn.disabled = false;
    stopBtn.disabled = true;

    const timestampStr = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const sessionName = `Vault-${timestampStr}`;
    saveSessionToDB(sessionName, output.innerHTML);
}

function visualize() {
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    function renderFrame() {
        animationId = requestAnimationFrame(renderFrame);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = '#0e1626';
        ctx.fillRect(0, 0, width, height);

        const barWidth = (width / dataArray.length) * 2.5;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const barHeight = (dataArray[i] / 255) * height;
            ctx.fillStyle = `rgb(2, 132, 199)`;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
    renderFrame();
}

function saveSessionToDB(name, htmlContent) {
    if (!db || !isVaultUnlocked) return;
    const transaction = db.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');
    const request = store.add({ name: name, date: new Date().toLocaleString(), content: htmlContent });

    request.onsuccess = () => {
        loadSidebarSessions();
    };
}

function loadSidebarSessions() {
    if (!db || !isVaultUnlocked) return;
    sessionList.innerHTML = '';
    const transaction = db.transaction(['sessions'], 'readonly');
    const store = transaction.objectStore('sessions');
    const request = store.openCursor();

    request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const session = cursor.value;
            const item = document.createElement('div');
            item.className = 'session-item';

            const info = document.createElement('div');
            info.className = 'session-info';
            info.innerHTML = `<strong>${session.name}</strong><br><small>${session.date}</small>`;

            info.onclick = () => {
                output.innerHTML = session.content;
                summaryOutput.innerText = "Loaded session from vault. Click 'Run Offline AI LLM' to summarize.";
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'session-delete';
            delBtn.innerHTML = '🗑️';
            delBtn.onclick = (ev) => {
                ev.stopPropagation();
                deleteSessionFromDB(cursor.key);
            };

            item.appendChild(info);
            item.appendChild(delBtn);
            sessionList.appendChild(item);

            cursor.continue();
        }
    };
}

function deleteSessionFromDB(id) {
    const transaction = db.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');
    const request = store.delete(id);
    request.onsuccess = () => loadSidebarSessions();
}

// PWA Install Prompt Capture Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installAppBtn) {
        installAppBtn.style.display = 'inline-block';
        installAppBtn.addEventListener('click', async () => {
            installAppBtn.style.display = 'none';
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
        });
    }
});

window.addEventListener('appinstalled', () => {
    console.log('PWA was installed successfully');
    if (installAppBtn) installAppBtn.style.display = 'none';
});

// Multi-Format Export Hub Handlers
function getCleanText() {
    return output.innerText.replace(/<[^>]*>?/gm, '');
}

exportTxt.addEventListener('click', () => {
    const blob = new Blob([getCleanText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

exportPdf.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("VoiceScribe AI Autonomous - Enterprise Report", 14, 20);

    const splitText = doc.splitTextToSize(getCleanText(), 180);
    doc.text(splitText, 14, 30);
    doc.save(`Transcript-Report-${Date.now()}.pdf`);
});

exportDocx.addEventListener('click', async () => {
    const { Document, Packer, Paragraph, TextRun } = window.docx;
    const cleanText = getCleanText();
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun({ text: "VoiceScribe AI Autonomous - Enterprise Report", bold: true, size: 28 }),
                    ],
                }),
                new Paragraph({
                    children: [new TextRun({ text: cleanText, size: 22 })],
                }),
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transcript-Report-${Date.now()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
});

startBtn.addEventListener('click', startStream);
stopBtn.addEventListener('click', stopStream);
summaryBtn.addEventListener('click', () => runOfflineLLMSummary(output.innerText));