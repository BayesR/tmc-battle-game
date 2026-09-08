import type { CardMaster } from '../types/card';
import type { CompareResult } from '../types/game';

/**
 * 勝敗判定ロジック（既存 TMC Battle Simulator の compareCards をそのまま移植）
 * ------------------------------------------------------------------
 * ① Root Counter（最優先）: Monster Pride ① は ⑤ に必ず勝つ
 * ② Potential Point: 自分のPPのうち「相手のLegacyと一致する枠」を自分のMPに加算
 * ③ Void: 相手のPP加算のみを無効化する（自分のPPは通常通り適用）
 * ④ 最終的なMonster Prideを比較
 * ⑤ 同値なら引き分け
 *
 * NPC対戦モードでは、この関数をマトリクス的に全部計算するのではなく
 * 1回ずつ順番に呼び出す形で使う。
 */
export function compareCards(self: CardMaster, enemy: CardMaster): CompareResult {
  // ① Root Counter
  if (self.monsterPride === 1 && enemy.monsterPride === 5) {
    return {
      winner: 'self',
      selfPower: self.monsterPride,
      enemyPower: enemy.monsterPride,
      rootCounter: true,
      rootCounterSide: 'self',
      selfVoidNullifiedEnemyBonus: false,
      enemyVoidNullifiedSelfBonus: false,
    };
  }
  if (enemy.monsterPride === 1 && self.monsterPride === 5) {
    return {
      winner: 'enemy',
      selfPower: self.monsterPride,
      enemyPower: enemy.monsterPride,
      rootCounter: true,
      rootCounterSide: 'enemy',
      selfVoidNullifiedEnemyBonus: false,
      enemyVoidNullifiedSelfBonus: false,
    };
  }

  // ② Potential Point（相手のLegacyと一致する自分のPP枠を合算）
  const sumMatchingPP = (owner: CardMaster, opponent: CardMaster) =>
    owner.potentialPoints
      .filter((pp) => pp.legacy === opponent.legacy)
      .reduce((sum, pp) => sum + pp.value, 0);

  let selfBonus = sumMatchingPP(self, enemy);
  let enemyBonus = sumMatchingPP(enemy, self);

  // ③ Void（相手のPP加算のみを無効化。自分のPPは通常通り適用）
  const selfVoidNullifiedEnemyBonus = self.hasVoid && enemyBonus !== 0;
  const enemyVoidNullifiedSelfBonus = enemy.hasVoid && selfBonus !== 0;

  if (self.hasVoid) enemyBonus = 0;
  if (enemy.hasVoid) selfBonus = 0;

  // ④ 最終的なMonster Prideを比較
  const selfPower = self.monsterPride + selfBonus;
  const enemyPower = enemy.monsterPride + enemyBonus;

  // ⑤ 同値なら引き分け
  let winner: CompareResult['winner'] = 'draw';
  if (selfPower > enemyPower) winner = 'self';
  else if (enemyPower > selfPower) winner = 'enemy';

  return {
    winner,
    selfPower,
    enemyPower,
    rootCounter: false,
    selfVoidNullifiedEnemyBonus,
    enemyVoidNullifiedSelfBonus,
  };
}
