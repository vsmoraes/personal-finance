import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import pt from "./locales/pt-BR.json" with { type: "json" };
const browser = typeof navigator === "undefined" ? "en" : navigator.language;
await i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    "pt-BR": { translation: pt },
  },
  lng: browser.startsWith("es")
    ? "es"
    : browser.startsWith("pt")
      ? "pt-BR"
      : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
