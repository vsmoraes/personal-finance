import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import pt from "./locales/pt-BR.json" with { type: "json" };
const browser = typeof navigator === "undefined" ? "en" : navigator.language;
let saved = "";
try {
  if (typeof localStorage !== "undefined")
    saved = localStorage.getItem("finance-login-language") || "";
} catch {
  // Browser privacy settings may make local storage unavailable.
}
const preferred = ["en", "es", "pt-BR"].includes(saved) ? saved : browser;
await i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    "pt-BR": { translation: pt },
  },
  lng: preferred.startsWith("es")
    ? "es"
    : preferred.startsWith("pt")
      ? "pt-BR"
      : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;
