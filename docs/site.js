const LANGUAGE_KEY = "kanjiwidget-site-language";
const DOWNLOAD_COUNT_KEY = "kanjiwidget-download-count";
const supportedLanguages = new Set(["en", "ru"]);
const statsEnabled = new URLSearchParams(window.location.search).get("stats") === "1";
const downloadStatsUrl = "https://img.shields.io/github/downloads/platwa/KanjiWidget/total.json";
let releaseDownloadCount = null;

function preferredLanguage() {
  const saved = window.localStorage.getItem(LANGUAGE_KEY);
  if (supportedLanguages.has(saved)) return saved;
  return "en";
}

function setLanguage(language) {
  const lang = supportedLanguages.has(language) ? language : "en";
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  window.localStorage.setItem(LANGUAGE_KEY, lang);

  document.querySelectorAll("[data-en][data-ru]").forEach((element) => {
    element.textContent = element.dataset[lang];
  });

  document.querySelectorAll("[data-language-option]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.languageOption === lang);
  });

  document.querySelectorAll(".hero-window-en, .widget-image-en, .panel-image-en").forEach((element) => {
    element.hidden = lang !== "en";
  });
  document.querySelectorAll(".hero-window-ru, .widget-image-ru, .panel-image-ru").forEach((element) => {
    element.hidden = lang !== "ru";
  });

  document.title = lang === "ru"
    ? "Японские слова и кандзи на рабочем столе Windows | KanjiWidget"
    : "Japanese Vocabulary & Kanji Widget for Windows | KanjiWidget";

  updateDownloadCount();
}

function updateDownloadCount() {
  const element = document.getElementById("download-count");
  if (!element || releaseDownloadCount === null) return;

  const russian = document.documentElement.lang === "ru";
  const formatted = new Intl.NumberFormat(russian ? "ru-RU" : "en-US").format(releaseDownloadCount);
  element.textContent = russian ? `${formatted} скачиваний` : `${formatted} downloads`;
  element.title = russian
    ? "Общее число загрузок прикреплённых файлов релизов по данным GitHub"
    : "Total downloads of attached release files reported by GitHub";
  element.hidden = false;
}

async function loadDownloadCount() {
  const cached = JSON.parse(window.localStorage.getItem(DOWNLOAD_COUNT_KEY) || "null");
  if (cached && Number.isFinite(cached.count) && cached.expiresAt > Date.now()) {
    releaseDownloadCount = cached.count;
    updateDownloadCount();
    return;
  }

  try {
    const response = await fetch(downloadStatsUrl);
    if (!response.ok) return;

    const badge = await response.json();
    releaseDownloadCount = Number(badge.value ?? badge.message);
    if (!Number.isFinite(releaseDownloadCount)) return;
    window.localStorage.setItem(DOWNLOAD_COUNT_KEY, JSON.stringify({
      count: releaseDownloadCount,
      expiresAt: Date.now() + 60 * 60 * 1000,
    }));
    updateDownloadCount();
  } catch {
    // The counter is optional; downloads remain available if GitHub's API is unreachable.
  }
}

document.getElementById("language-toggle").addEventListener("click", () => {
  setLanguage(document.documentElement.lang === "en" ? "ru" : "en");
});

setLanguage(preferredLanguage());
if (statsEnabled) loadDownloadCount();
