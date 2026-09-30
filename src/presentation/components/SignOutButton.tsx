import { useAuth } from "@presentation/context/AuthContext";
import { useLanguage } from "@presentation/context/LanguageContext";
import { useConfirm } from "@presentation/context/FeedbackContext";
import Icon from "@presentation/components/ui/Icon";

/** Sign out after a confirmation. Icon-only unless `withLabel`. */
export default function SignOutButton({ className, withLabel }: { className: string; withLabel?: boolean }) {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const confirm = useConfirm();
  return (
    <button
      type="button"
      className={className}
      title={withLabel ? undefined : t("signOut")}
      aria-label={withLabel ? undefined : t("signOut")}
      onClick={async () => {
        const ok = await confirm({
          title: t("signOutConfirmTitle"),
          message: t("signOutConfirmBody"),
          confirmLabel: t("signOut"),
          danger: true,
        });
        if (ok) await signOut();
      }}
    >
      <Icon name="logout" size={withLabel ? 18 : 20} />
      {withLabel && ` ${t("signOut")}`}
    </button>
  );
}
