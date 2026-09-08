import type { Legacy, PotentialLegacy } from '../types/card';

/** Legacyのテーマカラー（公式・既存シミュレーターと共通） */
export const LEGACY_COLOR: Record<Legacy, string> = {
  制: '#F4C542', // Babylon
  愛: '#FF5FA2', // Love
  環: '#4CAF50', // Nature
  邪: '#2B2B2B', // Darkness
  聖: '#F5F5F5', // Saint
};

export const LEGACY_LABEL_EN: Record<Legacy, string> = {
  制: 'Babylon',
  愛: 'Love',
  環: 'Nature',
  邪: 'Darkness',
  聖: 'Saint',
};

/** 邪（黒）・聖（白）はダーク背景で視認性が悪いので、文字色を調整する */
export function legacyTextColor(legacy: Legacy): string {
  if (legacy === '邪') return '#F5F5F5';
  if (legacy === '聖') return '#111111';
  return '#111111';
}

export function potentialLegacyColor(legacy: PotentialLegacy): string {
  if (legacy === '未使用') return '#4B5563';
  return LEGACY_COLOR[legacy];
}

/** UR/SUR/SSURのホログラム演出用：カード自身のLegacy色を基調にした発光色（邪・聖は視認性のため調整） */
export function holoGlowColor(legacy: Legacy): string {
  if (legacy === '邪') return '#c4b5fd'; // 黒だと発光が見えないため明るい紫に
  if (legacy === '聖') return '#fde68a'; // 真っ白だと発光感が薄いため淡い金色に
  return LEGACY_COLOR[legacy] ?? '#ffffff';
}

/** Legacyカラーのhexを、指定した透明度のrgba()文字列に変換する（カードの背景トーン用） */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
