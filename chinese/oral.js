/* oral.js — AI Chinese oral tutor (看图说话) for oral.html.
   The tutor is Claude (Anthropic), called directly from the browser with a
   user-supplied key. Speech in/out reuses the same Azure proxy the practice
   hub is configured with (localStorage key 'chinese-azure-speech'), so the
   WAV-encoding and proxy call shapes mirror chinese.js. */
(function () {
  'use strict';

  // ═══ Config ═══
  const AZURE_CONFIG_KEY = 'chinese-azure-speech'; // shared with chinese.js
  const ORAL_CONFIG_KEY = 'chinese-oral-config';
  const DEFAULT_MODEL = 'claude-haiku-4-5';
  const MAX_CHILD_TURNS = 8; // system prompt tells the tutor to wrap up around here

  function getAzureConfig() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(AZURE_CONFIG_KEY) || '{}'); } catch { }
    return { proxyUrl: (cfg.proxyUrl || '').replace(/\/+$/, ''), apiKey: cfg.apiKey || '', threshold: cfg.threshold || 70 };
  }
  function saveAzureConfig(patch) {
    // Preserve fields the hub owns (e.g. threshold) — only patch proxy fields.
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(AZURE_CONFIG_KEY) || '{}'); } catch { }
    Object.assign(cfg, patch);
    try { localStorage.setItem(AZURE_CONFIG_KEY, JSON.stringify(cfg)); } catch { }
  }
  function isAzureConfigured() {
    const cfg = getAzureConfig();
    return !!(cfg.proxyUrl && cfg.apiKey);
  }

  function getOralConfig() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(ORAL_CONFIG_KEY) || '{}'); } catch { }
    return { anthropicKey: cfg.anthropicKey || '', model: cfg.model || DEFAULT_MODEL, level: cfg.level || 2 };
  }
  function saveOralConfig(patch) {
    const cfg = getOralConfig();
    Object.assign(cfg, patch);
    try { localStorage.setItem(ORAL_CONFIG_KEY, JSON.stringify(cfg)); } catch { }
  }

  // ═══ State ═══
  const S = {
    image: null,        // { data: base64 jpeg (no prefix), mediaType, url }
    level: getOralConfig().level,
    messages: [],       // Anthropic messages array (full history, resent each turn)
    childTurns: 0,
    busy: false,
    recording: false,
    ended: false,
  };

  const $ = id => document.getElementById(id);

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  // ═══ System prompt ═══
  function buildSystemPrompt(level) {
    return [
      `You are 陈老师 (Teacher Chen), a warm and patient Chinese oral tutor for a Primary ${level} student in Singapore. You are practising 看图说话 (picture description, like the school oral exam) with the student, based on the picture provided in the first message.`,
      '',
      'Hard rules:',
      '- Reply ONLY in Simplified Chinese. Never use English, pinyin, or translations in your replies to the student.',
      `- Use vocabulary and sentence patterns a Primary ${level} student following the Singapore MOE 华文 syllabus would know. Prefer simple, common words.`,
      '- Keep every reply to 1–2 short sentences, and ask exactly ONE question per turn.',
      '- Be warm and encouraging: briefly praise something specific the student said before asking the next question.',
      "- The student's replies are transcribed by speech recognition and may contain recognition errors. If a reply seems garbled or doesn't make sense, don't guess — gently ask the student to repeat, e.g. 老师没听清楚，你可以再说一次吗？",
      '- If the student replies in English, respond warmly in Chinese and encourage them to try again in Chinese, e.g. 你可以试试用华语说吗？You may offer one simple Chinese word to help them.',
      '- Guide the conversation like an oral exam: first who/what is in the picture, then what is happening, then feelings and thoughts, and finally a simple opinion or a connection to the student\'s own life.',
      `- After about ${MAX_CHILD_TURNS} student turns, wrap up warmly (e.g. 你今天说得真棒！我们下次再练习。) and stop asking questions.`,
      '',
      'Example exchanges (style reference only):',
      '学生: 图片里有一个小男孩。',
      '老师: 对！你观察得很仔细。小男孩在做什么呢？',
      '学生: 他在公园跑步。',
      '老师: 说得好！他跑步的时候，心情怎么样？',
      '',
      'When you receive a message starting with [FEEDBACK REQUEST], the practice session is over. Stop the roleplay and reply with exactly these two labelled sections:',
      '【给学生】 2–3 encouraging sentences in simple Chinese, mentioning one specific thing the student did well and one thing to practise.',
      '【家长报告】 A short report in English for the parent: strengths, vocabulary and grammar points to practise, and 2–3 useful Chinese phrases to rehearse (with pinyin).',
    ].join('\n');
  }

  // ═══ Anthropic call ═══
  // Adds a cache_control breakpoint on the last block of the last message so the
  // growing conversation history is cached incrementally turn over turn, on top
  // of the fixed system-prompt and opening-image breakpoints set below.
  function withCacheBreakpoint(messages) {
    if (!messages.length) return messages;
    const out = messages.slice(0, -1);
    const last = messages[messages.length - 1];
    let content = last.content;
    if (typeof content === 'string') {
      content = [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }];
    } else {
      content = content.map((block, i) =>
        i === content.length - 1 ? { ...block, cache_control: { type: 'ephemeral' } } : block
      );
    }
    out.push({ ...last, content });
    return out;
  }

  async function callClaude(maxTokens) {
    const cfg = getOralConfig();
    const body = {
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: maxTokens || 400,
      system: [{ type: 'text', text: buildSystemPrompt(S.level), cache_control: { type: 'ephemeral' } }],
      messages: withCacheBreakpoint(S.messages),
    };
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw { kind: 'network' };
    }
    if (res.status === 401 || res.status === 403) throw { kind: 'auth' };
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error?.message || ''; } catch { }
      throw { kind: 'server', message: msg };
    }
    const json = await res.json();
    if (json.stop_reason === 'refusal') throw { kind: 'refusal' };
    const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!text) throw { kind: 'server', message: 'empty response' };
    return text;
  }

  // ═══ TTS — Azure via proxy, speechSynthesis fallback ═══
  // A single reused <audio> element, unlocked during the Start tap so later
  // programmatic .play() calls survive mobile autoplay policies.
  const audioEl = new Audio();
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    // Play a moment of silence inside the user gesture.
    audioEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    audioEl.play().catch(() => { });
  }

  const ttsCache = new Map(); // text → object URL (this page load only)

  async function speak(text) {
    if (!text) return;
    if (isAzureConfigured()) {
      try {
        let url = ttsCache.get(text);
        if (!url) {
          const cfg = getAzureConfig();
          const ssml = `<speak version='1.0' xml:lang='zh-CN'><voice name='zh-CN-XiaoxiaoNeural'><prosody rate='-10%'>${esc(text)}</prosody></voice></speak>`;
          const res = await fetch(`${cfg.proxyUrl}/?action=TTS&token=${encodeURIComponent(cfg.apiKey)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            },
            body: ssml,
          });
          if (!res.ok) throw new Error(`tts ${res.status}`);
          url = URL.createObjectURL(await res.blob());
          ttsCache.set(text, url);
        }
        audioEl.pause();
        audioEl.src = url;
        await audioEl.play();
        return;
      } catch { /* fall through to speechSynthesis */ }
    }
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-CN';
    utt.rate = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(utt);
  }

  // ═══ STT — MediaRecorder → 16 kHz mono WAV → Azure proxy ═══
  let sttAudioCtx = null;

  async function blobToWav16kMono(blob) {
    const buf = await blob.arrayBuffer();
    if (!sttAudioCtx) sttAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await sttAudioCtx.decodeAudioData(buf);
    const rate = 16000;
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return encodeWavPcm16(rendered);
  }

  function encodeWavPcm16(audioBuffer) {
    const samples = audioBuffer.getChannelData(0);
    const rate = audioBuffer.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    out.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 1, true);
    out.setUint32(24, rate, true);
    out.setUint32(28, rate * 2, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    writeStr(36, 'data');
    out.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([out.buffer], { type: 'audio/wav' });
  }

  async function transcribe(wavBlob) {
    const cfg = getAzureConfig();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try {
      res = await fetch(`${cfg.proxyUrl}/?action=STT&language=zh-CN&format=simple&token=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Accept': 'application/json',
        },
        body: wavBlob,
        signal: ctrl.signal,
      });
    } catch {
      throw { kind: 'network' };
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw { kind: 'auth' };
    if (!res.ok) throw { kind: 'server' };
    const json = await res.json();
    if (json.RecognitionStatus !== 'Success' || !json.DisplayText) return null; // no speech recognized
    return json.DisplayText;
  }

  // ═══ Image prep — downscale to ≤1568px long edge, JPEG base64 ═══
  function fileToJpeg(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1568;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(objUrl);
        resolve({ data: dataUrl.split(',')[1], mediaType: 'image/jpeg', url: dataUrl });
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('bad image')); };
      img.src = objUrl;
    });
  }

  // ═══ Chat UI ═══
  function addBubble(role, text) {
    const div = document.createElement('div');
    div.className = `bubble ${role}`;
    const span = document.createElement('span');
    span.textContent = text;
    div.appendChild(span);
    if (role === 'tutor') {
      const btn = document.createElement('button');
      btn.className = 'speak-btn';
      btn.title = 'Listen';
      btn.textContent = '🔊';
      btn.addEventListener('click', () => speak(text));
      div.appendChild(btn);
    }
    $('chat-log').appendChild(div);
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
    return div;
  }

  function setStatus(msg) { $('chat-status').textContent = msg || ''; }

  function setBusy(busy) {
    S.busy = busy;
    $('mic-btn').disabled = busy || S.ended;
    $('typed-send-btn').disabled = busy || S.ended;
    $('finish-btn').disabled = busy;
  }

  function friendlyError(err) {
    if (!err) return 'Something went wrong — try again';
    if (err.kind === 'auth') return 'Key problem — ask a parent to check settings ⚙';
    if (err.kind === 'network') return 'No internet — try again in a moment';
    if (err.kind === 'refusal') return 'The tutor could not answer that — try a different picture';
    return 'Something went wrong — try again' + (err.message ? ` (${err.message})` : '');
  }

  // ═══ Conversation flow ═══
  async function startSession() {
    const cfg = getOralConfig();
    if (!cfg.anthropicKey) {
      $('setup-status').textContent = 'Add your Anthropic API key in settings ⚙ first';
      return;
    }
    if (!S.image) {
      $('setup-status').textContent = 'Choose a picture first';
      return;
    }
    $('setup-status').textContent = '';
    unlockAudio();
    saveOralConfig({ level: S.level });

    S.messages = [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: S.image.mediaType, data: S.image.data },
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: '（图片已上传。请开始看图说话的口试练习：先用一句话跟学生打招呼，然后问关于这张图片的第一个简单问题。）' },
      ],
    }];
    S.childTurns = 0;
    S.ended = false;
    $('chat-log').innerHTML = '';
    $('chat-pic').src = S.image.url;
    $('mic-btn').style.display = isAzureConfigured() ? '' : 'none';
    $('typed-row').hidden = isAzureConfigured();
    showScreen('screen-chat');
    await tutorTurn();
  }

  // Calls Claude on the current history and appends the tutor's reply.
  async function tutorTurn() {
    setBusy(true);
    setStatus('老师在想… 🤔');
    const thinking = addBubble('tutor thinking', '…');
    try {
      const reply = await callClaude(400);
      thinking.remove();
      S.messages.push({ role: 'assistant', content: reply });
      addBubble('tutor', reply);
      setStatus('');
      speak(reply);
    } catch (err) {
      thinking.remove();
      // Drop the un-answered user turn so retrying doesn't double it up —
      // unless this was the opening turn (image), which must stay.
      if (S.messages.length > 1 && S.messages[S.messages.length - 1].role === 'user') S.messages.pop();
      setStatus(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function childTurn(text) {
    if (S.busy || S.ended || !text) return;
    addBubble('child', text);
    S.messages.push({ role: 'user', content: text });
    S.childTurns++;
    await tutorTurn();
  }

  async function finishSession() {
    if (S.busy) return;
    S.ended = true;
    setBusy(true);
    setStatus('准备反馈中… 📝');
    S.messages.push({
      role: 'user',
      content: '[FEEDBACK REQUEST] 口试练习结束。请按照系统指示，提供【给学生】和【家长报告】两部分反馈。',
    });
    try {
      const reply = await callClaude(1000);
      S.messages.push({ role: 'assistant', content: reply });
      renderFeedback(reply);
    } catch (err) {
      S.messages.pop(); // keep history clean for a retry
      S.ended = false;
      setStatus(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  let fbStudentText = '';
  function renderFeedback(reply) {
    // Expected shape: 【给学生】…【家长报告】… — fall back to showing everything.
    let student = reply, parent = '';
    const pIdx = reply.indexOf('【家长报告】');
    if (pIdx !== -1) {
      student = reply.slice(0, pIdx);
      parent = reply.slice(pIdx + '【家长报告】'.length).trim();
    }
    student = student.replace('【给学生】', '').trim();
    fbStudentText = student;
    $('fb-student').textContent = student;
    $('fb-parent').textContent = parent || '—';
    showScreen('screen-feedback');
    speak(student);
  }

  // ═══ Recording (hold-to-talk) ═══
  let recStream = null;
  let recorder = null;
  let recChunks = [];
  let recStart = 0;
  let recMaxTimer = null;

  async function startRecording() {
    if (S.busy || S.recording || S.ended || !isAzureConfigured()) return;
    if (!sttAudioCtx) { try { sttAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } }
    if (sttAudioCtx && sttAudioCtx.state === 'suspended') sttAudioCtx.resume().catch(() => { });

    if (!recStream) {
      try {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        setStatus('Microphone blocked — allow it in browser settings');
        return;
      }
    }
    if (S.busy || S.recording) return; // state may have changed while awaiting

    recChunks = [];
    try { recorder = new MediaRecorder(recStream); } catch {
      setStatus('Recording not supported in this browser');
      return;
    }
    recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = () => {
      $('mic-btn').classList.remove('recording');
      S.recording = false;
      const durMs = Date.now() - recStart;
      const blob = new Blob(recChunks, { type: recorder && recorder.mimeType || 'audio/webm' });
      recChunks = [];
      if (durMs < 400 || !blob.size) {
        setStatus('Too short — hold the button while you speak');
        return;
      }
      processRecording(blob);
    };
    S.recording = true;
    recStart = Date.now();
    recorder.start();
    $('mic-btn').classList.add('recording');
    setStatus('Listening… release when done');
    clearTimeout(recMaxTimer);
    recMaxTimer = setTimeout(stopRecording, 30000);
  }

  function stopRecording() {
    clearTimeout(recMaxTimer);
    if (!S.recording || !recorder || recorder.state === 'inactive') return;
    try { recorder.stop(); } catch { }
  }

  async function processRecording(blob) {
    setBusy(true);
    setStatus('听写中… ✍️');
    try {
      const wav = await blobToWav16kMono(blob);
      const text = await transcribe(wav);
      setBusy(false);
      if (!text) {
        setStatus("I couldn't hear you — try again!");
        return;
      }
      setStatus('');
      await childTurn(text);
    } catch (err) {
      setBusy(false);
      setStatus(friendlyError(err));
    }
  }

  // ═══ Settings modal ═══
  function openSettings() {
    const oral = getOralConfig();
    const azure = getAzureConfig();
    $('os-anthropic-key').value = oral.anthropicKey;
    $('os-model').value = oral.model;
    $('os-proxy-url').value = azure.proxyUrl;
    $('os-proxy-key').value = azure.apiKey;
    $('os-test-status').textContent = '';
    $('oral-settings-modal').classList.add('open');
  }

  function saveSettings() {
    saveOralConfig({
      anthropicKey: $('os-anthropic-key').value.trim(),
      model: $('os-model').value.trim() || DEFAULT_MODEL,
    });
    saveAzureConfig({
      proxyUrl: $('os-proxy-url').value.trim().replace(/\/+$/, ''),
      apiKey: $('os-proxy-key').value.trim(),
    });
    $('oral-settings-modal').classList.remove('open');
    updateStartState();
  }

  async function testConnections() {
    saveSettings();
    $('oral-settings-modal').classList.add('open');
    const status = $('os-test-status');
    const lines = [];
    status.style.color = 'var(--muted)';
    status.textContent = 'Testing…';

    const oral = getOralConfig();
    if (!oral.anthropicKey) {
      lines.push('✗ Anthropic: no key entered');
    } else {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': oral.anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model: oral.model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        });
        lines.push(res.ok ? '✓ Anthropic key works' : `✗ Anthropic: ${res.status === 401 ? 'invalid key' : 'error ' + res.status}`);
      } catch {
        lines.push('✗ Anthropic: network error');
      }
    }

    const azure = getAzureConfig();
    if (!azure.proxyUrl || !azure.apiKey) {
      lines.push('• Speech proxy not set — the child will type instead of speak');
    } else {
      try {
        const res = await fetch(`${azure.proxyUrl}/?action=Test&token=${encodeURIComponent(azure.apiKey)}`);
        if (res.status === 401 || res.status === 403) lines.push('✗ Speech proxy: wrong key');
        else if (res.ok) lines.push('✓ Speech proxy works');
        else lines.push('✗ Speech proxy reachable, but Azure key/region is wrong');
      } catch {
        lines.push('✗ Speech proxy: not reachable');
      }
    }

    status.textContent = lines.join('\n');
    status.style.color = lines.every(l => l.startsWith('✓') || l.startsWith('•')) ? 'var(--ok)' : 'var(--err)';
  }

  // ═══ Setup screen wiring ═══
  function updateStartState() {
    $('start-btn').disabled = !S.image;
    const cfg = getOralConfig();
    if (!cfg.anthropicKey) $('setup-status').textContent = 'Add your Anthropic API key in settings ⚙ to begin';
    else if ($('setup-status').textContent.startsWith('Add your')) $('setup-status').textContent = '';
  }

  async function handlePicked(file) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      S.image = await fileToJpeg(file);
    } catch {
      $('setup-status').textContent = "Couldn't read that image — try another one";
      return;
    }
    $('pic-preview').src = S.image.url;
    $('pic-preview').hidden = false;
    $('pic-drop-hint').hidden = true;
    updateStartState();
  }

  function init() {
    // Picture picker
    $('pic-input').addEventListener('change', e => handlePicked(e.target.files[0]));
    const drop = $('pic-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      handlePicked(e.dataTransfer.files[0]);
    });

    // Level chips
    document.querySelectorAll('.level-chip').forEach(chip => {
      if (Number(chip.dataset.level) === S.level) chip.classList.add('active');
      chip.addEventListener('click', () => {
        document.querySelectorAll('.level-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        S.level = Number(chip.dataset.level);
      });
    });

    $('start-btn').addEventListener('click', startSession);

    // Mic (hold-to-talk)
    const mic = $('mic-btn');
    mic.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { mic.setPointerCapture(e.pointerId); } catch { }
      startRecording();
    });
    const release = e => {
      try { mic.releasePointerCapture(e.pointerId); } catch { }
      stopRecording();
    };
    mic.addEventListener('pointerup', release);
    mic.addEventListener('pointercancel', release);
    mic.addEventListener('contextmenu', e => e.preventDefault());

    // Typed fallback
    $('kbd-toggle-btn').addEventListener('click', () => {
      $('typed-row').hidden = !$('typed-row').hidden;
      if (!$('typed-row').hidden) $('typed-input').focus();
    });
    const sendTyped = () => {
      const text = $('typed-input').value.trim();
      if (!text) return;
      $('typed-input').value = '';
      childTurn(text);
    };
    $('typed-send-btn').addEventListener('click', sendTyped);
    $('typed-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendTyped(); });

    $('finish-btn').addEventListener('click', finishSession);

    // Feedback screen
    $('fb-student-speak').addEventListener('click', () => speak(fbStudentText));
    $('again-btn').addEventListener('click', () => { startSession(); });
    $('new-btn').addEventListener('click', () => {
      S.image = null;
      $('pic-preview').hidden = true;
      $('pic-drop-hint').hidden = false;
      $('pic-input').value = '';
      updateStartState();
      showScreen('screen-setup');
    });

    // Settings
    $('settings-btn').addEventListener('click', openSettings);
    $('os-close').addEventListener('click', () => $('oral-settings-modal').classList.remove('open'));
    $('oral-settings-modal').addEventListener('click', e => {
      if (e.target === $('oral-settings-modal')) $('oral-settings-modal').classList.remove('open');
    });
    $('os-save').addEventListener('click', saveSettings);
    $('os-test').addEventListener('click', testConnections);

    updateStartState();
  }

  init();
})();
