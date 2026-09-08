interface Props {
  suddenDeathRoundCount: number;
}

/** サドンデスで決着した場合に結果画面に表示する補足バナー */
export function SuddenDeathBanner({ suddenDeathRoundCount }: Props) {
  return (
    <div className="rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-center text-xs font-bold text-amber-300">
      5戦が同数だったため、サドンデス（{suddenDeathRoundCount}戦目）で決着しました
    </div>
  );
}
