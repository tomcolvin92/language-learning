let lessonManifest = [];
let currentLesson = null;
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
  lessonSelect: document.querySelector("#lessonSelect"),
  playerTitle: document.querySelector("#playerTitle"),
  playStatus: document.querySelector("#playStatus"),
  repeatCount: document.querySelector("#repeatCount"),
  frSpeed: document.querySelector("#frSpeed"),
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

function audioPath(text, lang) {
  return `${currentLesson.audioBase}/${lang}/${audioSlug(text)}.mp3`;
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

function playAudioFile(text, lang, playbackRate = 1) {
  return new Promise((resolve, reject) => {
    const path = audioPath(text, lang);
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

async function playMp3Only(text, lang, playbackRate = 1) {
  els.speechNote.hidden = true;
  try {
    await playAudioFile(text, lang, playbackRate);
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

function makeItems() {
  if (!currentLesson) return [];
  if (playerMode === "words") {
    return (currentLesson.words || []).map((word) => ({
      id: word.id,
      fr: word.say || word.fr,
      displayFr: word.fr,
      en: word.en,
      sound: word.sound || "",
      kind: "word"
    }));
  }

  return (currentLesson.listeningSentences || []).map((sentence) => ({
    id: sentence.id,
    fr: sentence.fr,
    displayFr: sentence.fr,
    en: sentence.en,
    sound: "",
    kind: "sentence"
  }));
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
  els.playStatus.textContent = `${items.length} ${noun} ready.`;
}

function renderModeButtons() {
  document.querySelectorAll("[data-player-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.playerMode === playerMode);
  });
}

function renderLessonShell() {
  document.querySelector("h1").textContent = currentLesson.title;
  els.lessonLevel.textContent = `Level ${currentLesson.level}`;
  els.voiceStatus.textContent = "Lesson MP3 audio is active.";
  els.audioStatus.textContent = `${currentLesson.id} is loaded from JSON. No browser speech fallback.`;
}

async function playItemAtIndex(index) {
  const item = items[index];
  if (!item) return false;

  const repeats = Number.parseInt(els.repeatCount.value, 10) || 1;
  const frSpeed = Number.parseFloat(els.frSpeed.value) || 1;
  setActiveItem(index);
  els.playStatus.textContent = `${index + 1} of ${items.length}: ${item.displayFr}`;

  for (let repeat = 0; repeat < repeats; repeat += 1) {
    if (playbackStopped) return false;
    els.playStatus.textContent = `${index + 1} of ${items.length}: French ${repeat + 1} of ${repeats} — ${item.displayFr}`;
    if (!(await playMp3Only(item.fr, "fr", frSpeed))) return false;
    if (repeat < repeats - 1) await wait(300);
  }

  if (item.en && !playbackStopped) {
    await wait(450);
    els.playStatus.textContent = `${index + 1} of ${items.length}: English — ${item.en}`;
    if (!(await playMp3Only(item.en, "en"))) return false;
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
  els.lessonSelect.innerHTML = "";
  lessonManifest.forEach((lesson) => {
    const option = document.createElement("option");
    option.value = lesson.path;
    option.textContent = `Level ${lesson.level}: ${lesson.title}`;
    els.lessonSelect.append(option);
  });
}

async function loadManifest() {
  if (window.LESSON_BUNDLE?.manifest?.lessons) {
    lessonManifest = window.LESSON_BUNDLE.manifest.lessons;
    return;
  }

  const response = await fetch("lessons/index.json");
  if (!response.ok) throw new Error("Could not load lessons/index.json");
  const manifest = await response.json();
  lessonManifest = manifest.lessons || [];
  if (lessonManifest.length === 0) throw new Error("No lessons are listed in lessons/index.json");
}

function getBundledLesson(path) {
  const lessonId = path.match(/lesson-\d+/)?.[0];
  return lessonId ? window.LESSON_BUNDLE?.lessons?.[lessonId] : null;
}

async function loadLesson(path) {
  stopPlayback();
  currentLesson = getBundledLesson(path);
  if (!currentLesson) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path}`);
    currentLesson = await response.json();
  }

  renderLessonShell();
  renderItems();
}

async function initializeApp() {
  try {
    await loadManifest();
    renderLessonOptions();
    await loadLesson(lessonManifest[0].path);
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

els.lessonSelect.addEventListener("change", () => loadLesson(els.lessonSelect.value));
els.playAll.addEventListener("click", playAllItems);
els.stopPlayback.addEventListener("click", stopPlayback);
els.shuffleItems.addEventListener("click", () => {
  stopPlayback();
  renderItems(shuffle(items));
});

initializeApp();
