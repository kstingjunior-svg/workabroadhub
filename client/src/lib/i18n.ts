import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "@/locales/en.json";
import sw from "@/locales/sw.json";
import fr from "@/locales/fr.json";
import ar from "@/locales/ar.json";

export const languages = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "sw", name: "Kiswahili", flag: "🇰🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "ar", name: "العربية", flag: "🇸🇦", dir: "rtl" },
] as const;

export type LanguageCode = typeof languages[number]["code"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sw: { translation: sw },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

// Set RTL direction on initial load based on detected language
const updateDirection = (lng: string) => {
  const lang = languages.find((l) => l.code === lng);
  document.documentElement.dir = lang && "dir" in lang ? lang.dir : "ltr";
};

// Apply direction on init
updateDirection(i18n.language);

// Update direction when language changes
i18n.on("languageChanged", updateDirection);

export default i18n;
