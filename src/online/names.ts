/**
 * オンライン対戦の表示名（サーバーが自動生成する）
 * ------------------------------------------------------------------
 * クライアントが送ってきた名前は使わない（不適切な名前の対策を不要にするため）。
 * NPC名と同じ世界観の「◯◯ジャナー」形式。将来、ストーリーモードの実績で解放される称号を
 * 選べるようにする場合は、この接頭辞の部分を置き換える。
 */
export const NAME_PREFIXES: readonly string[] = [
  '見習いの',
  '駆け出しの',
  '新米',
  '腕利きの',
  '経験豊富な',
  '慣れた',
  '熟練の',
  '手練れの',
  '選ばれし',
  '伝説の',
  '最強クラスの',
  '無敗の',
];

export const NAME_SUFFIX = 'ジャナー';

/** 表示名を1つ作る。avoid（相手の名前）と同じにならないようにする */
export function generateOnlineName(rng: () => number, avoid?: string | null): string {
  const pick = () => NAME_PREFIXES[Math.min(NAME_PREFIXES.length - 1, Math.floor(rng() * NAME_PREFIXES.length))] + NAME_SUFFIX;
  let name = pick();
  for (let i = 0; i < 20 && name === avoid; i++) name = pick();
  if (name === avoid) {
    // 乱数が偏って被り続けた場合の保険：必ず別の名前にする
    const index = NAME_PREFIXES.findIndex((p) => p + NAME_SUFFIX === avoid);
    name = NAME_PREFIXES[(index + 1) % NAME_PREFIXES.length] + NAME_SUFFIX;
  }
  return name;
}
