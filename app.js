let lessonManifest = [];
let currentLesson = null;
let words = [];
let listeningTemplates = [];
let currentWordIndex = 0;
let currentCategory = "";
let score = 0;
let quizAnswer = null;
let listeningSentences = [];
let listeningStopped = false;
let listeningIsPlaying = false;
let listeningRunId = 0;
let currentAudio = null;
let currentAudioResolve = null;

const els = {
  score: document.querySelector("#score"),
  lessonLevel: document.querySelector("#lessonLevel"),
  lessonSelect: document.querySelector("#lessonSelect"),
  bankTitle: document.querySelector("#bankTitle"),
  categoryButtons: document.querySelector("#categoryButtons"),
  wordCategory: document.querySelector("#wordCategory"),
  frenchWord: document.querySelector("#frenchWord"),
  pronunciation: document.querySelector("#pronunciation"),
  englishWord: document.querySelector("#englishWord"),
  wordList: document.querySelector("#wordList"),
  quizPrompt: document.querySelector("#quizPrompt"),
  quizPromptType: document.querySelector("#quizPromptType"),
  answers: document.querySelector("#answers"),
  feedback: document.querySelector("#feedback"),
  speechNote: document.querySelector("#speechNote"),
  voiceStatus: document.querySelector("#voiceStatus"),
  audioStatus: document.querySelector("#audioStatus"),
  listeningList: document.querySelector("#listeningList"),
  listeningTitle: document.querySelector("#listeningTitle"),
  listeningStatus: document.querySelector("#listeningStatus")
};

const modes = {
  words: document.querySelector("#wordMode"),
  quiz: document.querySelector("#quizMode"),
  listening: document.querySelector("#listeningMode")
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

function playAudioFile(text, lang) {
  return new Promise((resolve, reject) => {
    const path = audioPath(text, lang);
    const audio = new Audio(path);
    currentAudio = audio;
    currentAudioResolve = resolve;
    audio.preload = "auto";
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
    els.speechNote.textContent = "Audio was blocked by the browser. Click the play button again, or reload the page and try once more.";
    els.speechNote.hidden = false;
    els.voiceStatus.textContent = "The MP3 exists, but playback did not start.";
    return;
  }

  els.speechNote.textContent = `Could not load local MP3: ${issue?.path || "unknown file"}`;
  els.speechNote.hidden = false;
  els.voiceStatus.textContent = "A matching MP3 file could not be loaded from the local server.";
}

function speak(text, kind = "word") {
  const lang = kind === "english" ? "en" : "fr";
  els.speechNote.hidden = true;
  stopCurrentAudio();
  playAudioFile(text, lang).catch(showAudioIssue);
}

async function playMp3Only(text, lang) {
  els.speechNote.hidden = true;
  try {
    await playAudioFile(text, lang);
    return true;
  } catch (issue) {
    showAudioIssue(issue);
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getVisibleWords() {
  return words.filter((word) => word.category === currentCategory);
}

function renderWord() {
  const visible = getVisibleWords();
  if (visible.length === 0) {
    els.wordCategory.textContent = "No words";
    els.frenchWord.textContent = "Lesson empty";
    els.pronunciation.textContent = "";
    els.englishWord.textContent = "";
    return;
  }

  const word = visible[currentWordIndex % visible.length];
  els.wordCategory.textContent = word.category;
  els.frenchWord.textContent = word.fr;
  els.pronunciation.textContent = word.sound || "";
  els.englishWord.textContent = word.en;
}

function renderCategories() {
  const categories = [...new Set(words.map((word) => word.category))];
  currentCategory = categories.includes(currentCategory) ? currentCategory : categories[0] || "";
  els.categoryButtons.innerHTML = "";

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category;
    button.className = category === currentCategory ? "active" : "";
    button.addEventListener("click", () => {
      currentCategory = category;
      currentWordIndex = 0;
      renderCategories();
      renderWord();
    });
    els.categoryButtons.append(button);
  });
}

function renderWordBank() {
  els.wordList.innerHTML = "";
  words.forEach((word) => {
    const item = document.createElement("div");
    item.className = "word-item";
    item.innerHTML = `<div><strong>${word.fr}</strong><span>${word.en}</span></div>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "▶";
    button.setAttribute("aria-label", `Play ${word.fr}`);
    button.addEventListener("click", () => speak(word.say || word.fr, "word"));
    item.append(button);
    els.wordList.append(item);
  });
}

function switchMode(mode) {
  Object.entries(modes).forEach(([name, element]) => {
    element.classList.toggle("hidden", name !== mode);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  if (mode === "quiz") renderQuiz();
  if (mode === "listening" && listeningSentences.length === 0) makeListeningList();
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function renderQuiz() {
  els.feedback.textContent = "";
  els.answers.innerHTML = "";

  if (words.length < 4) {
    els.quizPromptType.textContent = "Not enough words";
    els.quizPrompt.textContent = "Add more words to test";
    return;
  }

  const question = words[Math.floor(Math.random() * words.length)];
  quizAnswer = question.en;
  els.quizPromptType.textContent = "Translate this word";
  els.quizPrompt.textContent = question.fr;

  const wrongAnswers = shuffle(words.filter((word) => word.en !== question.en)).slice(0, 3).map((word) => word.en);
  shuffle([question.en, ...wrongAnswers]).forEach((answer) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = answer;
    button.addEventListener("click", () => chooseAnswer(button, answer));
    els.answers.append(button);
  });
}

function chooseAnswer(button, answer) {
  const buttons = [...els.answers.querySelectorAll("button")];
  buttons.forEach((item) => {
    item.disabled = true;
    if (item.textContent === quizAnswer) item.classList.add("correct");
  });
  if (answer === quizAnswer) {
    score += 1;
    els.score.textContent = score;
    els.feedback.textContent = "Correct. Très bien.";
  } else {
    button.classList.add("wrong");
    els.feedback.textContent = `Almost. The answer is ${quizAnswer}.`;
  }
}

function makeListeningList() {
  listeningSentences = shuffle(listeningTemplates);
  renderListeningList();
  els.listeningTitle.textContent = `${listeningSentences.length} listening sentences`;
  els.listeningStatus.textContent = "French twice, then English.";
}

function setActiveListeningItem(index) {
  document.querySelectorAll(".listening-item").forEach((item, itemIndex) => {
    item.classList.toggle("active", itemIndex === index);
  });
}

function renderListeningList() {
  els.listeningList.innerHTML = "";
  listeningSentences.forEach((sentence, index) => {
    const item = document.createElement("div");
    item.className = "listening-item";
    item.innerHTML = `
      <span class="listening-number">${index + 1}</span>
      <div class="listening-text">
        <strong>${sentence.fr}</strong>
        <span>${sentence.en}</span>
      </div>
    `;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "▶";
    button.setAttribute("aria-label", `Play sentence ${index + 1}`);
    button.addEventListener("click", () => playListeningSentence(index));
    item.append(button);
    els.listeningList.append(item);
  });
}

async function playListeningSentence(index) {
  listeningStopped = false;
  stopCurrentAudio();
  const sentence = listeningSentences[index];
  setActiveListeningItem(index);
  els.listeningStatus.textContent = `${index + 1} of ${listeningSentences.length}: listen in French twice, then English.`;
  if (!(await playMp3Only(sentence.fr, "fr"))) return;
  await wait(350);
  if (listeningStopped) return;
  if (!(await playMp3Only(sentence.fr, "fr"))) return;
  await wait(450);
  if (listeningStopped) return;
  if (!(await playMp3Only(sentence.en, "en"))) return;
  setActiveListeningItem(-1);
  if (!listeningIsPlaying) els.listeningStatus.textContent = "French twice, then English.";
}

async function playAllListening() {
  if (listeningIsPlaying) return;
  listeningIsPlaying = true;
  listeningStopped = false;
  const runId = listeningRunId + 1;
  listeningRunId = runId;
  stopCurrentAudio();
  let playbackFailed = false;

  for (let index = 0; index < listeningSentences.length; index += 1) {
    if (listeningStopped || runId !== listeningRunId) break;
    const sentence = listeningSentences[index];
    setActiveListeningItem(index);
    els.listeningStatus.textContent = `${index + 1} of ${listeningSentences.length}: listen in French twice, then English.`;

    if (!(await playMp3Only(sentence.fr, "fr"))) {
      playbackFailed = true;
      break;
    }
    await wait(350);
    if (listeningStopped || runId !== listeningRunId) break;

    if (!(await playMp3Only(sentence.fr, "fr"))) {
      playbackFailed = true;
      break;
    }
    await wait(450);
    if (listeningStopped || runId !== listeningRunId) break;

    if (!(await playMp3Only(sentence.en, "en"))) {
      playbackFailed = true;
      break;
    }
    await wait(650);
  }

  if (runId !== listeningRunId) return;
  listeningIsPlaying = false;
  setActiveListeningItem(-1);
  els.listeningStatus.textContent = playbackFailed
    ? "Playback stopped because audio did not start."
    : listeningStopped
      ? "Stopped."
      : `Finished all ${listeningSentences.length} sentences.`;
}

function stopListening() {
  listeningStopped = true;
  listeningRunId += 1;
  listeningIsPlaying = false;
  stopCurrentAudio();
  setActiveListeningItem(-1);
  els.listeningStatus.textContent = "Stopped.";
}

function resetLessonState() {
  stopListening();
  currentWordIndex = 0;
  currentCategory = "";
  quizAnswer = null;
  listeningSentences = [];
  els.feedback.textContent = "";
  els.answers.innerHTML = "";
  els.speechNote.hidden = true;
  els.voiceStatus.textContent = "Lesson MP3 audio is active.";
}

function renderLessonShell() {
  document.querySelector("h1").textContent = currentLesson.title;
  els.lessonLevel.textContent = `Level ${currentLesson.level}`;
  els.bankTitle.textContent = `${currentLesson.title} Words`;
  els.voiceStatus.textContent = "Lesson MP3 audio is active.";
  els.audioStatus.textContent = `${currentLesson.id} is loaded from JSON. No browser speech fallback.`;
}

async function loadLesson(path) {
  resetLessonState();
  currentLesson = getBundledLesson(path);
  if (!currentLesson) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path}`);
    currentLesson = await response.json();
  }
  words = currentLesson.words || [];
  listeningTemplates = currentLesson.listeningSentences || [];
  renderLessonShell();
  renderCategories();
  renderWord();
  renderWordBank();
  makeListeningList();
  switchMode(document.querySelector(".tab.active").dataset.mode);
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

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

document.querySelector("#prevWord").addEventListener("click", () => {
  const visible = getVisibleWords();
  if (visible.length === 0) return;
  currentWordIndex = (currentWordIndex - 1 + visible.length) % visible.length;
  renderWord();
});

document.querySelector("#nextWord").addEventListener("click", () => {
  const visible = getVisibleWords();
  if (visible.length === 0) return;
  currentWordIndex = (currentWordIndex + 1) % visible.length;
  renderWord();
});

document.querySelector("#playWord").addEventListener("click", () => {
  const word = getVisibleWords()[currentWordIndex % getVisibleWords().length];
  if (word) speak(word.say || word.fr, "word");
});

document.querySelector("#nextQuestion").addEventListener("click", renderQuiz);
document.querySelector("#playAllListening").addEventListener("click", playAllListening);
document.querySelector("#stopListening").addEventListener("click", stopListening);
document.querySelector("#newListeningList").addEventListener("click", makeListeningList);
els.lessonSelect.addEventListener("change", () => loadLesson(els.lessonSelect.value));

initializeApp();
