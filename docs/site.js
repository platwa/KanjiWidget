const LANGUAGE_KEY = "kanjiwidget-site-language";
const supportedLanguages = new Set(["en", "ru"]);

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
    ? "KanjiWidget — японский всегда перед глазами"
    : "KanjiWidget — Japanese stays in sight";
}

document.getElementById("language-toggle").addEventListener("click", () => {
  setLanguage(document.documentElement.lang === "en" ? "ru" : "en");
});

setLanguage(preferredLanguage());
