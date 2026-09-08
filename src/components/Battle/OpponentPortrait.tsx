import type { NpcLevel } from '../../types/card';

interface Props {
  size?: number;
  level?: NpcLevel;
}

/**
 * 対戦相手（NPC）の見た目：右上に表示する四角い窓枠アイコンの中に、
 * バストアップ（胸から上）で表示する。NPCレベルに応じて見た目を差し替える（テスト実装）：
 *   Lv1：顔の見えないフードを被った人
 *   Lv2：甲冑の騎士
 *   Lv3：ドラゴンの顔をしたヒューマノイド
 *   Lv4：死神（骸骨と鎌）
 *   Lv5：ストリートの死神（帽子を被った単眼が光るレアキャラ専用ビジュアル）
 * ストーリーモード（Phase 3）でNPCごとの見た目にさらに差し替えられるよう、単体コンポーネントにしてある。
 */
export function OpponentPortrait({ size = 84, level = 'Lv1' }: Props) {
  return (
    <div
      className="flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border-2"
      style={{
        width: size,
        height: size,
        borderColor: '#0a0a0b',
        background: 'radial-gradient(circle at 50% 30%, #3a3a40 0%, #17171a 75%)',
        boxShadow: 'inset 0 0 14px rgba(0,0,0,0.7), 0 4px 10px rgba(0,0,0,0.5)',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">
        {level === 'Lv2' && (
          <>
            {/* 肩・胸元（甲冑） */}
            <path d="M60,44 C34,44 16,66 8,124 L112,124 C104,66 86,44 60,44 Z" fill="#3d4550" stroke="#0a0a0b" strokeWidth="2.5" />
            <path d="M60,44 C34,44 16,66 8,124 L46,124 C42,90 48,60 60,44 Z" fill="rgba(255,255,255,0.07)" />
            {/* 肩当て */}
            <ellipse cx="26" cy="70" rx="14" ry="12" fill="#4b5563" stroke="#0a0a0b" strokeWidth="2" />
            <ellipse cx="94" cy="70" rx="14" ry="12" fill="#4b5563" stroke="#0a0a0b" strokeWidth="2" />
            {/* 兜 */}
            <ellipse cx="60" cy="46" rx="30" ry="34" fill="#5b6472" stroke="#0a0a0b" strokeWidth="2.5" />
            {/* バイザーの隙間 */}
            <rect x="45" y="42" width="30" height="6" rx="2" fill="#08080a" />
            <rect x="57" y="42" width="6" height="24" fill="#08080a" />
          </>
        )}

        {level === 'Lv3' && (
          <>
            {/* 肩・胸元（鱗のような質感） */}
            <path d="M60,44 C34,44 16,66 8,124 L112,124 C104,66 86,44 60,44 Z" fill="#25423a" stroke="#0a0a0b" strokeWidth="2.5" />
            <path d="M60,44 C34,44 16,66 8,124 L46,124 C42,90 48,60 60,44 Z" fill="rgba(255,255,255,0.05)" />
            {/* 頭部 */}
            <ellipse cx="60" cy="48" rx="30" ry="32" fill="#2f5347" stroke="#0a0a0b" strokeWidth="2.5" />
            {/* 吻（ドラゴンの鼻先） */}
            <path
              d="M40,56 C40,72 50,80 60,80 C70,80 80,72 80,56 C80,66 70,70 60,70 C50,70 40,66 40,56 Z"
              fill="#264238"
              stroke="#0a0a0b"
              strokeWidth="2"
            />
            {/* 角 */}
            <path d="M40,26 L34,10 L44,22 Z" fill="#1c332c" stroke="#0a0a0b" strokeWidth="1.5" />
            <path d="M80,26 L86,10 L76,22 Z" fill="#1c332c" stroke="#0a0a0b" strokeWidth="1.5" />
            {/* 目 */}
            <ellipse cx="47" cy="46" rx="4" ry="2.5" fill="#facc15" />
            <ellipse cx="73" cy="46" rx="4" ry="2.5" fill="#facc15" />
          </>
        )}

        {level === 'Lv4' && (
          <>
            {/* 肩・胸元（漆黒のローブ） */}
            <path d="M60,44 C34,44 16,66 8,124 L112,124 C104,66 86,44 60,44 Z" fill="#1a1a1e" stroke="#000000" strokeWidth="2.5" />
            <path d="M60,44 C34,44 16,66 8,124 L46,124 C42,90 48,60 60,44 Z" fill="rgba(255,255,255,0.03)" />
            {/* フード */}
            <ellipse cx="60" cy="46" rx="32" ry="36" fill="#141416" stroke="#000000" strokeWidth="2.5" />
            {/* 頭蓋骨 */}
            <ellipse cx="60" cy="52" rx="18" ry="20" fill="#e8e4da" />
            <ellipse cx="52" cy="50" rx="4.5" ry="6" fill="#141416" />
            <ellipse cx="68" cy="50" rx="4.5" ry="6" fill="#141416" />
            <path d="M58,60 L62,60 L60,64 Z" fill="#141416" />
            <path d="M50,68 L70,68 M53,68 L53,71 M58,68 L58,71 M62,68 L62,71 M67,68 L67,71" stroke="#141416" strokeWidth="1.5" />
            {/* 鎌（右脇に小さく） */}
            <path d="M96,30 C108,28 114,38 108,48" fill="none" stroke="#c9c9c9" strokeWidth="3" strokeLinecap="round" />
            <line x1="96" y1="30" x2="90" y2="86" stroke="#4b3621" strokeWidth="3" strokeLinecap="round" />
          </>
        )}

        {level === 'Lv5' && (
          <>
            {/* 肩・胸元（継ぎ接ぎの漆黒ローブ） */}
            <path d="M60,44 C34,44 16,66 8,124 L112,124 C104,66 86,44 60,44 Z" fill="#241a2e" stroke="#000000" strokeWidth="2.5" />
            <path d="M60,44 C34,44 16,66 8,124 L46,124 C42,90 48,60 60,44 Z" fill="rgba(255,255,255,0.04)" />
            {/* パッチ（ガチャガチャした街の雰囲気） */}
            <rect x="28" y="88" width="9" height="9" fill="#c9a35f" opacity="0.85" />
            <rect x="84" y="100" width="8" height="8" fill="#5a8a7a" opacity="0.85" />
            {/* 帽子のクラウン（潰れたシルクハット風） */}
            <path d="M46,18 C46,18 54,12 60,12 C66,12 74,18 74,18 L76,39 L44,39 Z" fill="#332c3a" stroke="#000000" strokeWidth="2" />
            {/* 帽子のつば（少し歪んでいる） */}
            <path
              d="M28,37 C28,37 46,33 60,34 C74,33 92,37 92,37 L90,44 C90,44 74,41 60,41 C46,41 30,44 30,44 Z"
              fill="#3a3242"
              stroke="#000000"
              strokeWidth="2"
            />
            {/* 帽子の飾りピン */}
            <circle cx="52" cy="27" r="2.4" fill="#c1495a" />
            <rect x="65" y="24" width="4" height="4" fill="#eab308" transform="rotate(20 67 26)" />
            {/* 顔の陰（帽子の下・単眼以外は見えない） */}
            <ellipse cx="60" cy="49" rx="20" ry="16" fill="#0c0810" />
            {/* 単眼の光（グロー効果） */}
            <circle cx="60" cy="49" r="8" fill="#fbbf24" opacity="0.3" />
            <circle cx="60" cy="49" r="4.2" fill="#fde68a" />
            <circle cx="60" cy="49" r="2" fill="#fff7d6" />
          </>
        )}

        {(level === 'Lv1' || !['Lv2', 'Lv3', 'Lv4', 'Lv5'].includes(level)) && (
          <>
            {/* 肩・胸元（フード付きローブ） */}
            <path d="M60,44 C34,44 16,66 8,124 L112,124 C104,66 86,44 60,44 Z" fill="#2c2c30" stroke="#0a0a0b" strokeWidth="2.5" />
            <path d="M60,44 C34,44 16,66 8,124 L46,124 C42,90 48,60 60,44 Z" fill="rgba(255,255,255,0.045)" />
            {/* フード */}
            <ellipse cx="60" cy="46" rx="32" ry="36" fill="#232326" stroke="#0a0a0b" strokeWidth="2.5" />
            {/* 顔（陰で見えない） */}
            <ellipse cx="60" cy="55" rx="18" ry="21" fill="#08080a" />
          </>
        )}
      </svg>
    </div>
  );
}
