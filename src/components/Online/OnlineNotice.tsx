/**
 * 対戦内容の記録についての案内（利用者向け）。
 * 運営者用の匿名の対戦ログ（src/online/matchLog.ts）に合わせた内容。記録するのは、使われたカードと勝敗だけで、
 * 表示名などは記録しない。保存期間（既定90日）を変えた場合は、この文言を直す必要はない（「一定期間」としてある）。
 * 記録しない設定（LOG_MATCHES=false）の場合でも、「記録することがあります」という表現なので誤りにならない。
 */
export function OnlineNotice() {
  return (
    <p className="text-center text-[10px] leading-relaxed text-zinc-500" data-testid="online-notice">
      運営は、統計とバランス調整のために、対戦で使われたカードと勝敗を、個人が特定できない形で記録することがあります。表示名などは記録せず、記録は一定期間で削除します。
    </p>
  );
}
