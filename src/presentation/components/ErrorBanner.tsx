import { useLanguage } from "@presentation/context/LanguageContext";

interface Props {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: Props) {
  const { t } = useLanguage();
  return (
    <div className="error-banner">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {t("retry")}
        </button>
      )}
    </div>
  );
}
