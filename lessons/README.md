# Lesson Structure

Each lesson lives in its own folder:

```text
lessons/
  lesson-01/
    lesson.json
    audio/
      fr/
      en/
```

`lesson.json` is the source of truth. It contains:

- `words`: new vocabulary for the lesson.
- `sentenceGroups`: short practice sentences grouped by app theme.
- `listeningSentences`: the larger listening-practice bank.
- `audioBase`: the folder the app uses for MP3 playback.

Audio filenames are generated from the French or English text with the same slug rule used by the app and `generate_audio.py`.

When generating a new lesson, Python should load all previous `lesson.json` files in order. The combined previous `words` list is the known-word bank. New sentences can use both the new lesson words and the known-word bank, while avoiding new words that have not been introduced yet.
