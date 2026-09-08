import type { CardMaster } from '../types/card';
import rawCardPool from './cardPool.json';

/**
 * TMC_NPC_CardPool.xlsx（convert_master.py の出力）をそのままJSON化したもの。
 * 元データが更新された場合は、convert_master.py を再実行して
 * 生成された xlsx を再度 JSON 化し、cardPool.json を差し替えれば良い。
 *
 * 実データの列（カード名/Legacy/MonsterPride/PP1-3/Void/レアリティ/NPCレベル/元CardID）を
 * そのまま CardMaster 型にマッピングしている。
 */
export function loadCardPool(): CardMaster[] {
  return rawCardPool as CardMaster[];
}
