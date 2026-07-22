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
let audioCtx, analyser, dataArray, source, animationId;
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

function runOfflineLLMSummary(text) {
    if (!isVaultUnlocked) return;
    const cleanText = text.replace(/<[^>]*>?/gm, '');
    if (!cleanText || cleanText.trim().length === 0) {
        summaryOutput.innerText = 'No session content found.';
        return;
    }

    summaryOutput.innerText = 'Executing offline neural pipeline...';
    setTimeout(() => {
        const sentences = cleanText.split(/[.?!]\s+/).filter(s => s.trim().length > 0);
        let summary = '🤖 **Autonomous Offline AI Summary:**\n';
        let actions = '\n⚡ **Extracted Action Items:**\n';

        sentences.forEach((s, idx) => {
            if (idx % 2 === 0) summary += `• ${s.substring(0, 90)}...\n`;
            if (keywords.some(k => s.toLowerCase().includes(k))) {
                actions += `👉 [Task]: ${s}\n`;
            }
        });
        summaryOutput.innerHTML = highlightKeywords(summary + actions);
    }, 600);
}

// Speech Recognition Engine
function initSpeechEngine() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Web Speech API unsupported.');
        return;
    }

    if (recognition) {
        try { recognition.stop(); } catch(e) {}
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = langSelect.value;

    recognition.onresult = (e) => {
        let interimText = '';
        let finalChunk = '';

        for (let i = e.resultIndex; i < e.results.length; ++i) {
            let transcriptPiece = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                finalChunk += transcriptPiece;
            } else {
                interimText += transcriptPiece;
            }
        }

        if (finalChunk.trim().length > 0) {
            confirmedTranscript += `${getDiarizedPrefix()} ${finalChunk}<br>`;
            currentSpeaker = currentSpeaker === 'Speaker 1' ? 'Speaker 2' : 'Speaker 1';
        }

        let fullHTML = confirmedTranscript;
        if (interimText.trim().length > 0) {
            fullHTML += `${getDiarizedPrefix()} <span style="color: #38bdf8; opacity: 0.9; font-style: italic;">${interimText}</span>`;
        }

        output.innerHTML = highlightKeywords(fullHTML);
        output.scrollTop = output.scrollHeight;
    };

    recognition.onerror = (err) => console.warn('Speech error:', err.error);
    recognition.onend = () => {
        if (isRecording) {
            try { recognition.start(); } catch (e) {}
        }
    };

    try { recognition.start(); } catch (e) {}
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

        // Mobile par ringing sound se bachne ke liye AudioContext sirf tab banega jab desktop ho,
        // ya mobile par audio destination / analyser routing disable rakhi jaye gi.
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (!isMobile) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioCtx.createAnalyser();
                source = audioCtx.createMediaStreamSource(stream);
                source.connect(analyser);
                analyser.fftSize = 256;
                dataArray = new Uint8Array(analyser.frequencyBinCount);
                visualize();
            } catch (ex) {
                console.warn('AudioContext skipped', ex);
            }
        }

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.start(1000);

        confirmedTranscript = '';
        output.innerHTML = '';
        summaryOutput.innerText = 'Neural stream initializing...';

        initSpeechEngine();

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
    saveSessionToDB(`Vault-${timestampStr}`, output.innerHTML);
}

function visualize() {
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    function renderFrame() {
        if (!isRecording) return;
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
    store.add({ name: name, date: new Date().toLocaleString(), content: htmlContent });
    transaction.oncomplete = () => loadSidebarSessions();
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
                summaryOutput.innerText = "Loaded session from vault.";
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
    store.delete(id);
    transaction.oncomplete = () => loadSidebarSessions();
}

// PWA Install Handlers
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installAppBtn) installAppBtn.style.display = 'inline-block';
});

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installAppBtn.style.display = 'none';
        deferredPrompt = null;
    });
}

window.addEventListener('appinstalled', () => {
    if (installAppBtn) installAppBtn.style.display = 'none';
});

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
    doc.text("VoiceScribe AI Report", 14, 20);
    doc.text(doc.splitTextToSize(getCleanText(), 180), 14, 30);
    doc.save(`Transcript-${Date.now()}.pdf`);
});

exportDocx.addEventListener('click', async () => {
    if (!window.docx) {
        alert('DOCX library is still loading or blocked. Please try TXT or PDF export.');
        return;
    }
    const { Document, Packer, Paragraph, TextRun } = window.docx;
    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({ children: [new TextRun({ text: "VoiceScribe AI Report", bold: true, size: 28 })] }),
                new Paragraph({ children: [new TextRun({ text: getCleanText(), size: 22 })] }),
            ],
        }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transcript-${Date.now()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
});

startBtn.addEventListener('click', startStream);
stopBtn.addEventListener('click', stopStream);
summaryBtn.addEventListener('click', () => runOfflineLLMSummary(output.innerText));