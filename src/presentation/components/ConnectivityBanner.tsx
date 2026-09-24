import { useEffect, useState } from "react";
import { getAppMode } from "@infrastructure/config/appMode";
import { useLanguage } from "@presentation/context/LanguageContext";

export default function ConnectivityBanner() {
  const { t } = useLanguage();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Offline mode never expects a connection, so this warning would be noise there.
  if (getAppMode() === "offline" || online) return null;

  return <div className="connectivity-banner">⚠ {t("offlineWarning")}</div>;
}
