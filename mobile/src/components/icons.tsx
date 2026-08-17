import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The stroke icon set from the design canvas — 24-unit grid, rounded caps,
 * 1.7 default stroke. Paths are lifted verbatim from the approved mockups so
 * the app matches the design's line personality exactly.
 */

export type IconName =
  | 'home'
  | 'clock'
  | 'chart'
  | 'person'
  | 'streak'
  | 'arrowRight'
  | 'chevronRight'
  | 'chevronLeft'
  | 'close'
  | 'flag'
  | 'refresh'
  | 'check'
  | 'mail'
  | 'lock'
  | 'eye'
  | 'eyeOff'
  | 'alert'
  | 'book'
  | 'timer'
  | 'signOut'
  | 'help'
  | 'arrowUp';

export function Icon({
  name,
  size = 17,
  color,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <Path {...common} d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      )}
      {name === 'clock' && (
        <>
          <Circle {...common} cx={12} cy={12} r={8.5} />
          <Path {...common} d="M12 7.5V12l3 2" />
        </>
      )}
      {name === 'chart' && <Path {...common} d="M8 21V10M12 21V4M16 21v-7" />}
      {name === 'person' && (
        <>
          <Circle {...common} cx={12} cy={8} r={4} />
          <Path {...common} d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
        </>
      )}
      {name === 'streak' && <Path {...common} d="M12 2v14M6 10l6 6 6-6" />}
      {name === 'arrowRight' && <Path {...common} d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'chevronRight' && <Path {...common} d="M9 6l6 6-6 6" />}
      {name === 'chevronLeft' && <Path {...common} d="M15 6l-6 6 6 6" />}
      {name === 'close' && <Path {...common} d="M6 6l12 12M18 6L6 18" />}
      {name === 'flag' && <Path {...common} d="M4 21V4a1 1 0 0 1 1-1h13l-3 5 3 5H5" />}
      {name === 'refresh' && (
        <>
          <Path {...common} d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <Path {...common} d="M3 3v5h5" />
        </>
      )}
      {name === 'check' && <Path {...common} d="M4 12.5l5 5L20 7" />}
      {name === 'mail' && (
        <>
          <Rect {...common} x={3} y={5} width={18} height={14} rx={2} />
          <Path {...common} d="M3 7l9 6 9-6" />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect {...common} x={4} y={10} width={16} height={10} rx={2} />
          <Path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === 'eye' && (
        <>
          <Path {...common} d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
          <Circle {...common} cx={12} cy={12} r={2.5} />
        </>
      )}
      {name === 'eyeOff' && (
        <>
          <Path {...common} d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
          <Circle {...common} cx={12} cy={12} r={2.5} />
          <Path {...common} d="M4 20L20 4" />
        </>
      )}
      {name === 'alert' && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M12 8v4.5M12 16h.01" />
        </>
      )}
      {name === 'book' && (
        <>
          <Path {...common} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <Path {...common} d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </>
      )}
      {name === 'timer' && (
        <>
          <Circle {...common} cx={12} cy={13} r={7.5} />
          <Path {...common} d="M12 9.5V13l2.5 1.5M10 2h4" />
        </>
      )}
      {name === 'signOut' && (
        <Path {...common} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      )}
      {name === 'help' && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" />
        </>
      )}
      {name === 'arrowUp' && <Path {...common} d="M12 19V5M6 11l6-6 6 6" />}
    </Svg>
  );
}
