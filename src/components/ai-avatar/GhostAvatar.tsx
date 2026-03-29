import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AvatarMood } from './useAvatarMood';
import { EyePosition } from './useEyeMovement';

interface GhostAvatarProps {
  mood: AvatarMood;
  size?: number;
  isBlinking: boolean;
  eyePosition: EyePosition;
}

// Sparkle positions around the ghost
const sparkles = [
  { cx: 15, cy: 30, delay: 0 },
  { cx: 105, cy: 25, delay: 0.5 },
  { cx: 20, cy: 90, delay: 1.2 },
  { cx: 100, cy: 85, delay: 0.8 },
  { cx: 10, cy: 60, delay: 1.8 },
  { cx: 110, cy: 55, delay: 1.5 },
  { cx: 55, cy: 10, delay: 0.3 },
  { cx: 65, cy: 145, delay: 2.0 },
];

const getMouthPath = (mood: AvatarMood): string => {
  switch (mood) {
    case 'happy':
      return 'M 50 98 Q 60 108 70 98'; // wide smile
    case 'thinking':
      return 'M 53 100 L 67 100'; // straight line
    case 'worried':
      return 'M 50 104 Q 60 96 70 104'; // frown
    case 'proud':
      return 'M 48 98 Q 60 110 72 98'; // big smile
    default:
      return 'M 52 100 Q 60 106 68 100'; // gentle smile
  }
};

const getEyeScale = (mood: AvatarMood, isBlinking: boolean) => {
  if (isBlinking) return { scaleY: 0.1 };
  switch (mood) {
    case 'happy':
      return { scaleY: 0.6 }; // squint
    case 'worried':
      return { scaleY: 1.2 }; // wider
    case 'proud':
      return { scaleY: 0.15 }; // closed/satisfied
    default:
      return { scaleY: 1 };
  }
};

const getEyebrowY = (mood: AvatarMood): number => {
  switch (mood) {
    case 'worried':
      return 3; // lowered
    case 'happy':
      return -2;
    case 'thinking':
      return -1;
    default:
      return 0;
  }
};

const getBodyRotation = (eyeX: number): { scaleX: number; translateX: number } => {
  // Simulate body turning based on eye direction
  const normalizedX = eyeX / 5; // eyeX ranges roughly -5 to 5
  return {
    scaleX: 1 - Math.abs(normalizedX) * 0.03,
    translateX: normalizedX * 1.5,
  };
};

export const GhostAvatar = ({ mood, size = 112, isBlinking, eyePosition }: GhostAvatarProps) => {
  const mouthPath = useMemo(() => getMouthPath(mood), [mood]);
  const eyeAnim = getEyeScale(mood, isBlinking);
  const eyebrowY = getEyebrowY(mood);
  const bodyTransform = getBodyRotation(eyePosition.x);

  // Pupil offset (clamped)
  const pupilDx = Math.max(-3, Math.min(3, eyePosition.x * 0.6));
  const pupilDy = Math.max(-2, Math.min(2, eyePosition.y * 0.4));

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={{
        scaleX: bodyTransform.scaleX,
        x: bodyTransform.translateX,
      }}
      transition={{ type: 'spring', stiffness: 80, damping: 20 }}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Body gradient */}
        <radialGradient id="ghostBodyGrad" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#e8f4ff" />
          <stop offset="40%" stopColor="#c5e3ff" />
          <stop offset="80%" stopColor="#8ec5f0" />
          <stop offset="100%" stopColor="#6ab0e8" stopOpacity="0.6" />
        </radialGradient>

        {/* Head highlight */}
        <radialGradient id="ghostHeadHighlight" cx="40%" cy="30%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.9" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>

        {/* Antenna crystal gradient */}
        <linearGradient id="antennaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff9ec5" />
          <stop offset="50%" stopColor="#ff6ba8" />
          <stop offset="100%" stopColor="#e84d8a" />
        </linearGradient>

        {/* Eye gradient */}
        <radialGradient id="eyeGrad" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#5bc2f5" />
          <stop offset="60%" stopColor="#3a8fd4" />
          <stop offset="100%" stopColor="#2670b0" />
        </radialGradient>

        {/* Inner glow filter */}
        <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Sparkles */}
      {sparkles.map((s, i) => (
        <motion.circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r={1.5}
          fill="white"
          animate={{
            opacity: [0, 0.9, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: s.delay,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Ghost body — rounded head + wavy tail */}
      <motion.path
        d="
          M 60 22
          C 88 22 102 45 102 70
          C 102 95 100 115 100 130
          Q 95 140 88 130
          Q 82 122 76 132
          Q 70 142 64 130
          Q 58 120 52 132
          Q 46 142 40 130
          Q 34 120 28 132
          Q 22 140 18 130
          C 18 115 18 95 18 70
          C 18 45 32 22 60 22
          Z
        "
        fill="url(#ghostBodyGrad)"
        stroke="rgba(100,190,255,0.3)"
        strokeWidth="0.5"
        animate={{
          d: [
            // Base shape
            `M 60 22 C 88 22 102 45 102 70 C 102 95 100 115 100 130 Q 95 140 88 130 Q 82 122 76 132 Q 70 142 64 130 Q 58 120 52 132 Q 46 142 40 130 Q 34 120 28 132 Q 22 140 18 130 C 18 115 18 95 18 70 C 18 45 32 22 60 22 Z`,
            // Wavy tail variation
            `M 60 22 C 88 22 102 45 102 70 C 102 95 100 115 100 132 Q 94 124 88 134 Q 81 144 76 128 Q 70 118 64 134 Q 57 144 52 128 Q 46 118 40 134 Q 33 144 28 128 Q 22 118 18 132 C 18 115 18 95 18 70 C 18 45 32 22 60 22 Z`,
            // Back to base
            `M 60 22 C 88 22 102 45 102 70 C 102 95 100 115 100 130 Q 95 140 88 130 Q 82 122 76 132 Q 70 142 64 130 Q 58 120 52 132 Q 46 142 40 130 Q 34 120 28 132 Q 22 140 18 130 C 18 115 18 95 18 70 C 18 45 32 22 60 22 Z`,
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Head highlight overlay */}
      <ellipse cx="50" cy="52" rx="28" ry="25" fill="url(#ghostHeadHighlight)" opacity="0.5" />

      {/* Antenna stem */}
      <motion.line
        x1="60"
        y1="28"
        x2="60"
        y2="12"
        stroke="rgba(100,190,255,0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{ x2: [60, 58, 62, 60] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Antenna heart/crystal */}
      <motion.path
        d="M 60 5 C 56 0 48 2 48 8 C 48 13 60 18 60 18 C 60 18 72 13 72 8 C 72 2 64 0 60 5 Z"
        fill="url(#antennaGrad)"
        animate={{
          scale: [1, 1.15, 1],
          filter: [
            'drop-shadow(0 0 3px rgba(255,110,170,0.6))',
            'drop-shadow(0 0 8px rgba(255,110,170,0.9))',
            'drop-shadow(0 0 3px rgba(255,110,170,0.6))',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '60px 10px' }}
      />

      {/* Left eyebrow (only visible for worried/thinking) */}
      {(mood === 'worried' || mood === 'thinking') && (
        <motion.line
          x1="38"
          y1={62 + eyebrowY}
          x2="50"
          y2={mood === 'worried' ? 65 + eyebrowY : 63 + eyebrowY}
          stroke="rgba(60,130,200,0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}

      {/* Right eyebrow */}
      {(mood === 'worried' || mood === 'thinking') && (
        <motion.line
          x1="82"
          y1={mood === 'thinking' ? 60 + eyebrowY : 62 + eyebrowY}
          x2="70"
          y2={mood === 'worried' ? 65 + eyebrowY : 63 + eyebrowY}
          stroke="rgba(60,130,200,0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}

      {/* Left eye */}
      <g transform={`translate(${44 + pupilDx * 0.3}, ${72 + pupilDy * 0.2})`}>
        <motion.ellipse
          cx="0"
          cy="0"
          rx="9"
          ry="11"
          fill="url(#eyeGrad)"
          animate={eyeAnim}
          transition={{ duration: 0.15 }}
          style={{ transformOrigin: '0px 0px' }}
        />
        {/* Pupil */}
        <motion.ellipse
          cx={pupilDx * 0.4}
          cy={pupilDy * 0.3}
          rx="4"
          ry={isBlinking || mood === 'proud' ? 0.5 : 5}
          fill="#1a3a5c"
          transition={{ duration: 0.15 }}
        />
        {/* Highlight */}
        <circle cx={-2 + pupilDx * 0.2} cy={-3 + pupilDy * 0.1} r="2.5" fill="white" opacity={isBlinking || mood === 'proud' ? 0 : 0.9} />
        <circle cx={2 + pupilDx * 0.2} cy={1 + pupilDy * 0.1} r="1.2" fill="white" opacity={isBlinking || mood === 'proud' ? 0 : 0.6} />
      </g>

      {/* Right eye */}
      <g transform={`translate(${76 + pupilDx * 0.3}, ${72 + pupilDy * 0.2})`}>
        <motion.ellipse
          cx="0"
          cy="0"
          rx="9"
          ry="11"
          fill="url(#eyeGrad)"
          animate={eyeAnim}
          transition={{ duration: 0.15 }}
          style={{ transformOrigin: '0px 0px' }}
        />
        {/* Pupil */}
        <motion.ellipse
          cx={pupilDx * 0.4}
          cy={pupilDy * 0.3}
          rx="4"
          ry={isBlinking || mood === 'proud' ? 0.5 : 5}
          fill="#1a3a5c"
          transition={{ duration: 0.15 }}
        />
        {/* Highlight */}
        <circle cx={-2 + pupilDx * 0.2} cy={-3 + pupilDy * 0.1} r="2.5" fill="white" opacity={isBlinking || mood === 'proud' ? 0 : 0.9} />
        <circle cx={2 + pupilDx * 0.2} cy={1 + pupilDy * 0.1} r="1.2" fill="white" opacity={isBlinking || mood === 'proud' ? 0 : 0.6} />
      </g>

      {/* Blush cheeks */}
      <ellipse cx="34" cy="82" rx="6" ry="3.5" fill="rgba(255,150,180,0.25)" />
      <ellipse cx="86" cy="82" rx="6" ry="3.5" fill="rgba(255,150,180,0.25)" />

      {/* Mouth */}
      <motion.path
        d={mouthPath}
        stroke="rgba(60,120,180,0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        animate={{ d: mouthPath }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </motion.svg>
  );
};
