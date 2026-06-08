let lessonManifest = [];
let selectedLessonPaths = [];
let currentLessons = [];
let availableVoices = [];
let selectedVoice = "marin";
let playerMode = "sentences";
let items = [];
let playbackStopped = false;
let playbackIsPlaying = false;
let playbackRunId = 0;
let currentAudio = null;
let currentAudioResolve = null;

const els = {
  lessonLevel: document.querySelector("#lessonLevel"),
  lessonTitle: document.querySelector("#lessonTitle"),
  lessonToggleList: document.querySelector("#lessonToggleList"),
  selectAllLessons: document.querySelector("#selectAllLessons"),
  selectFirstLesson: document.querySelector("#selectFirstLesson"),
  playerTitle: document.querySelector("#playerTitle"),
  playStatus: document.querySelector("#playStatus"),
  repeatCount: document.querySelector("#repeatCount"),
  frSpeed: document.querySelector("#frSpeed"),
  voiceSelect: document.querySelector("#voiceSelect"),
  loopPlayback: document.querySelector("#loopPlayback"),
  playAll: document.querySelector("#playAll"),
  stopPlayback: document.querySelector("#stopPlayback"),
  shuffleItems: document.querySelector("#shuffleItems"),
  itemList: document.querySelector("#itemList"),
  speechNote: document.querySelector("#speechNote"),
  voiceStatus: document.querySelector("#voiceStatus"),
  audioStatus: document.querySelector("#audioStatus")
};

function audioSlug(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function audioPath(text, lang, audioBase, voice) {
  if (lang === "fr") {
    return `${audioBase}/${lang}/${voice}/${audioSlug(text)}.mp3`;
  }
  return `${audioBase}/${lang}/${audioSlug(text)}.mp3`;
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (currentAudioResolve) {
    currentAudioResolve();
    currentAudioResolve = null;
  }
}

function playAudioFile(text, lang, playbackRate = 1, audioBase = currentLessons[0]?.audioBase, voice = selectedVoice) {
  return new Promise((resolve, reject) => {
    const path = audioPath(text, lang, audioBase, voice);
    const audio = new Audio(path);
    currentAudio = audio;
    currentAudioResolve = resolve;
    audio.preload = "auto";
    audio.playbackRate = playbackRate;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      if (currentAudioResolve === resolve) currentAudioResolve = null;
      resolve();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      if (currentAudioResolve === resolve) currentAudioResolve = null;
      reject({ type: "load", path, error: audio.error });
    };
    audio.play().catch((error) => {
      if (currentAudio === audio) currentAudio = null;
      if (currentAudioResolve === resolve) currentAudioResolve = null;
      reject({ type: "playback", path, error });
    });
  });
}

function showAudioIssue(issue) {
  if (issue?.type === "playback") {
    els.speechNote.textContent = "Audio was blocked by the browser. Tap Play again, or reload the page and try once more.";
    els.speechNote.hidden = false;
    els.voiceStatus.textContent = "The MP3 exists, but playback did not start.";
    return;
  }

  els.speechNote.textContent = `Could not load local MP3: ${issue?.path || "unknown file"}`;
  els.speechNote.hidden = false;
  els.voiceStatus.textContent = "A matching MP3 file could not be loaded from the local server.";
}

async function playMp3Only(text, lang, playbackRate = 1, audioBase, voice) {
  els.speechNote.hidden = true;
  try {
    await playAudioFile(text, lang, playbackRate, audioBase, voice);
    return true;
  } catch (issue) {
    showAudioIssue(issue);
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function voiceLabel(voiceId) {
  const voice = availableVoices.find((item) => item.id === voiceId);
  return voice?.label || voiceId;
}

function lessonVoices(lesson) {
  return lesson.audioVoices?.length ? lesson.audioVoices : ["marin"];
}

function resolveVoice(item) {
  const voices = item.voices?.length ? item.voices : ["marin"];
  if (selectedVoice === "random") {
    return voices[Math.floor(Math.random() * voices.length)];
  }
  return voices.includes(selectedVoice) ? selectedVoice : voices[0];
}

function voiceSummary() {
  if (selectedVoice === "random") return "Random French voice";
  return `${voiceLabel(selectedVoice)} French voice`;
}

function makeItems() {
  if (currentLessons.length === 0) return [];
  if (playerMode === "words") {
    return currentLessons.flatMap((lesson) => (lesson.words || []).map((word) => ({
      id: `${lesson.id}-${word.id}`,
      fr: word.say || word.fr,
      displayFr: word.fr,
      en: word.en,
      sound: word.sound || "",
      kind: "word",
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      audioBase: lesson.audioBase,
      voices: lessonVoices(lesson)
    })));
  }

  return currentLessons.flatMap((lesson) => (lesson.listeningSentences || []).map((sentence) => ({
    id: `${lesson.id}-${sentence.id}`,
    fr: sentence.fr,
    displayFr: sentence.fr,
    en: sentence.en,
    sound: "",
    kind: "sentence",
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    audioBase: lesson.audioBase,
    voices: lessonVoices(lesson)
  })));
}

function setActiveItem(index) {
  let activeItem = null;
  document.querySelectorAll(".player-item").forEach((item, itemIndex) => {
    const isActive = itemIndex === index;
    item.classList.toggle("active", isActive);
    if (isActive) activeItem = item;
  });
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function renderItems(nextItems = makeItems()) {
  items = nextItems;
  els.itemList.innerHTML = "";
  items.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "player-item";
    row.innerHTML = `
      <span class="item-number">${index + 1}</span>
      <div class="item-text">
        <small>${item.lessonTitle} · ${selectedVoice === "random" ? "Random voice" : voiceLabel(resolveVoice(item))}</small>
        <strong>${item.displayFr}</strong>
        ${item.sound ? `<em>${item.sound}</em>` : ""}
        <span>${item.en}</span>
      </div>
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "▶";
    button.setAttribute("aria-label", `Play ${item.displayFr}`);
    button.addEventListener("click", () => playSingleItem(index));
    row.append(button);
    els.itemList.append(row);
  });

  const noun = playerMode === "words" ? "words" : "sentences";
  els.playerTitle.textContent = `${items.length} ${noun}`;
  els.playStatus.textContent = `${items.length} ${noun} ready with ${voiceSummary()}.`;
}

function renderModeButtons() {
  document.querySelectorAll("[data-player-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.playerMode === playerMode);
  });
}

function renderLessonShell() {
  if (currentLessons.length === 1) {
    document.querySelector("h1").textContent = currentLessons[0].title;
    els.lessonLevel.textContent = `Level ${currentLessons[0].level}`;
  } else {
    document.querySelector("h1").textContent = `${currentLessons.length} lessons selected`;
    els.lessonLevel.textContent = "Combined practice";
  }
  els.voiceStatus.textContent = "Lesson MP3 audio is active.";
  els.audioStatus.textContent = `${currentLessons.map((lesson) => lesson.id).join(", ")} loaded from JSON. French voice: ${voiceSummary()}.`;
}

async function playItemAtIndex(index) {
  const item = items[index];
  if (!item) return false;

  const repeats = Number.parseInt(els.repeatCount.value, 10) || 1;
  const frSpeed = Number.parseFloat(els.frSpeed.value) || 1;
  const voice = resolveVoice(item);
  setActiveItem(index);
  els.playStatus.textContent = `${index + 1} of ${items.length}: ${item.displayFr}`;

  for (let repeat = 0; repeat < repeats; repeat += 1) {
    if (playbackStopped) return false;
    els.playStatus.textContent = `${index + 1} of ${items.length}: ${voiceLabel(voice)} French ${repeat + 1} of ${repeats} — ${item.displayFr}`;
    if (!(await playMp3Only(item.fr, "fr", frSpeed, item.audioBase, voice))) return false;
    if (repeat < repeats - 1) await wait(300);
  }

  if (item.en && !playbackStopped) {
    await wait(450);
    els.playStatus.textContent = `${index + 1} of ${items.length}: English — ${item.en}`;
    if (!(await playMp3Only(item.en, "en", 1, item.audioBase))) return false;
  }

  return true;
}

async function playSingleItem(index) {
  stopPlayback();
  playbackStopped = false;
  playbackRunId += 1;
  const runId = playbackRunId;
  if (!(await playItemAtIndex(index))) return;
  if (runId !== playbackRunId) return;
  setActiveItem(-1);
  els.playStatus.textContent = `${index + 1} of ${items.length} played.`;
}

async function playAllItems() {
  if (playbackIsPlaying) return;
  playbackIsPlaying = true;
  playbackStopped = false;
  const runId = playbackRunId + 1;
  playbackRunId = runId;
  let playbackFailed = false;

  do {
    for (let index = 0; index < items.length; index += 1) {
      if (playbackStopped || runId !== playbackRunId) break;
      if (!(await playItemAtIndex(index))) {
        playbackFailed = !playbackStopped;
        break;
      }
      await wait(650);
    }
  } while (els.loopPlayback.checked && !playbackStopped && !playbackFailed && runId === playbackRunId);

  if (runId !== playbackRunId) return;
  playbackIsPlaying = false;
  setActiveItem(-1);
  els.playStatus.textContent = playbackFailed
    ? "Playback stopped because audio did not start."
    : playbackStopped
      ? "Stopped."
      : `Finished all ${items.length} ${playerMode}.`;
}

function stopPlayback() {
  playbackStopped = true;
  playbackRunId += 1;
  playbackIsPlaying = false;
  stopCurrentAudio();
  setActiveItem(-1);
  els.playStatus.textContent = "Stopped.";
}

function renderLessonOptions() {
  els.lessonToggleList.innerHTML = "";
  lessonManifest.forEach((lesson) => {
    const label = document.createElement("label");
    label.className = "lesson-toggle";
    label.innerHTML = `
      <input type="checkbox" value="${lesson.path}" />
      <span>Level ${lesson.level}: ${lesson.title}</span>
    `;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      const selected = [...els.lessonToggleList.querySelectorAll("input:checked")].map((item) => item.value);
      if (selected.length === 0) {
        input.checked = true;
        return;
      }
      selectedLessonPaths = selected;
      loadSelectedLessons();
    });
    els.lessonToggleList.append(label);
  });
}

function renderVoiceOptions() {
  els.voiceSelect.innerHTML = "";
  const randomOption = document.createElement("option");
  randomOption.value = "random";
  randomOption.textContent = "Random";
  els.voiceSelect.append(randomOption);

  availableVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.label;
    els.voiceSelect.append(option);
  });

  els.voiceSelect.value = selectedVoice;
}

async function loadManifest() {
  if (window.LESSON_BUNDLE?.manifest?.lessons) {
    const manifest = window.LESSON_BUNDLE.manifest;
    lessonManifest = manifest.lessons;
    availableVoices = manifest.voices || [{ id: "marin", label: "Marin" }];
    selectedVoice = manifest.defaultVoice || availableVoices[0]?.id || "marin";
    return;
  }

  const response = await fetch("lessons/index.json");
  if (!response.ok) throw new Error("Could not load lessons/index.json");
  const manifest = await response.json();
  lessonManifest = manifest.lessons || [];
  availableVoices = manifest.voices || [{ id: "marin", label: "Marin" }];
  selectedVoice = manifest.defaultVoice || availableVoices[0]?.id || "marin";
  if (lessonManifest.length === 0) throw new Error("No lessons are listed in lessons/index.json");
}

function getBundledLesson(path) {
  const lessonId = path.match(/lesson-\d+/)?.[0];
  return lessonId ? window.LESSON_BUNDLE?.lessons?.[lessonId] : null;
}

async function loadLesson(path) {
  const bundledLesson = getBundledLesson(path);
  if (bundledLesson) return bundledLesson;
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function loadSelectedLessons() {
  stopPlayback();
  currentLessons = await Promise.all(selectedLessonPaths.map(loadLesson));
  renderLessonShell();
  renderItems();
}

async function initializeApp() {
  try {
    await loadManifest();
    renderLessonOptions();
    renderVoiceOptions();
    selectedLessonPaths = [lessonManifest[0].path];
    syncLessonToggles();
    await loadSelectedLessons();
  } catch (error) {
    document.querySelector("h1").textContent = "Lesson Load Error";
    els.voiceStatus.textContent = error.message;
    els.audioStatus.textContent = "Open through a local server, or rebuild lessons/bundle.js if lesson files changed.";
  }
}

document.querySelectorAll("[data-player-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    stopPlayback();
    playerMode = button.dataset.playerMode;
    renderModeButtons();
    renderItems();
  });
});

function syncLessonToggles() {
  const selected = new Set(selectedLessonPaths);
  els.lessonToggleList.querySelectorAll("input").forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

els.selectAllLessons.addEventListener("click", () => {
  stopPlayback();
  selectedLessonPaths = lessonManifest.map((lesson) => lesson.path);
  syncLessonToggles();
  loadSelectedLessons();
});
els.selectFirstLesson.addEventListener("click", () => {
  stopPlayback();
  selectedLessonPaths = [lessonManifest[0].path];
  syncLessonToggles();
  loadSelectedLessons();
});
els.voiceSelect.addEventListener("change", () => {
  stopPlayback();
  selectedVoice = els.voiceSelect.value;
  renderLessonShell();
  renderItems();
});
els.playAll.addEventListener("click", playAllItems);
els.stopPlayback.addEventListener("click", stopPlayback);
els.shuffleItems.addEventListener("click", () => {
  stopPlayback();
  renderItems(shuffle(items));
});

initializeApp();
