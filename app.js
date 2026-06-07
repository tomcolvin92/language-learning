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
      reject(new Error(`Missing audio file: ${path}`));
    };
    audio.play().catch((error) => {
      if (currentAudio === audio) currentAudio = null;
      if (currentAudioResolve === resolve) currentAudioResolve = null;
      reject(error);
    });
  });
}

function showMissingAudio(text, lang) {
  const path = audioPath(text, lang);
  els.speechNote.textContent = `Missing local MP3: ${path}`;
  els.speechNote.hidden = false;
  els.voiceStatus.textContent = "A matching MP3 file is missing.";
}

function speak(text, kind = "word") {
  const lang = kind === "english" ? "en" : "fr";
  els.speechNote.hidden = true;
  stopCurrentAudio();
  playAudioFile(text, lang).catch(() => showMissingAudio(text, lang));
}

async function playMp3Only(text, lang) {
  try {
    await playAudioFile(text, lang);
  } catch {
    showMissingAudio(text, lang);
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
  listeningSentences = shuffle(listeningTemplates).slice(0, 30);
  renderListeningList();
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
  await playMp3Only(sentence.fr, "fr");
  await wait(350);
  if (listeningStopped) return;
  await playMp3Only(sentence.fr, "fr");
  await wait(450);
  if (listeningStopped) return;
  await playMp3Only(sentence.en, "en");
  setActiveListeningItem(-1);
  if (!listeningIsPlaying) els.listeningStatus.textContent = "French twice, then English.";
}

async function playAllListening() {
  if (listeningIsPlaying) return;
  listeningIsPlaying = true;
  listeningStopped = false;
  stopCurrentAudio();

  for (let index = 0; index < listeningSentences.length; index += 1) {
    if (listeningStopped) break;
    await playListeningSentence(index);
    await wait(650);
  }

  listeningIsPlaying = false;
  setActiveListeningItem(-1);
  els.listeningStatus.textContent = listeningStopped ? "Stopped." : "Finished all 30 sentences.";
}

function stopListening() {
  listeningStopped = true;
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
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  currentLesson = await response.json();
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
  const response = await fetch("lessons/index.json");
  if (!response.ok) throw new Error("Could not load lessons/index.json");
  const manifest = await response.json();
  lessonManifest = manifest.lessons || [];
  if (lessonManifest.length === 0) throw new Error("No lessons are listed in lessons/index.json");
}

async function initializeApp() {
  try {
    await loadManifest();
    renderLessonOptions();
    await loadLesson(lessonManifest[0].path);
  } catch (error) {
    document.querySelector("h1").textContent = "Lesson Load Error";
    els.voiceStatus.textContent = error.message;
    els.audioStatus.textContent = "Check lessons/index.json and the selected lesson JSON file.";
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
