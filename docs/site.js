const LANGUAGE_KEY = "kanjiwidget-site-language";
const DOWNLOAD_COUNT_KEY = "kanjiwidget-download-count";
const supportedLanguages = new Set(["en", "ru"]);
const statsEnabled = new URLSearchParams(window.location.search).get("stats") === "1";
const releasesApiUrl = "https://api.github.com/repos/platwa/KanjiWidget/releases?per_page=100";
const windowsDownloadPattern = /^KanjiWidget-\d+\.\d+\.\d+-x64-(?:Setup|Portable)\.exe$|^KanjiWidget-\d+\.\d+\.\d+-x64\.msi$/;
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
    ? "Общее число загрузок установщика, MSI и портативной версии по данным GitHub"
    : "Total Setup, MSI and portable downloads reported by GitHub";
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
    const response = await fetch(releasesApiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;

    const releases = await response.json();
    if (!Array.isArray(releases)) return;

    releaseDownloadCount = releases
      .flatMap((release) => Array.isArray(release.assets) ? release.assets : [])
      .filter((asset) => windowsDownloadPattern.test(asset.name))
      .reduce((total, asset) => total + (Number(asset.download_count) || 0), 0);
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
