import { motion } from "framer-motion";
import { useBlinking } from "./useBlinking";

export type AvatarMood = "neutral" | "happy" | "thinking" | "worried";

interface BlobAvatarProps {
  mood?: AvatarMood;
  size?: number;
}

const blobPaths: Record<AvatarMood, string[]> = {
  neutral: [
    "M 40 10 Q 65 10 70 40 Q 75 70 40 75 Q 5 70 10 40 Q 15 10 40 10 Z",
    "M 40 12 Q 68 14 72 42 Q 74 68 40 73 Q 8 68 12 38 Q 14 12 40 12 Z",
  ],
  happy: [
    "M 40 8 Q 70 8 74 38 Q 78 72 40 76 Q 2 72 6 38 Q 10 8 40 8 Z",
    "M 40 10 Q 72 12 76 40 Q 76 70 40 74 Q 4 70 8 36 Q 8 10 40 10 Z",
  ],
  thinking: [
    "M 40 12 Q 62 8 68 38 Q 74 72 40 74 Q 8 72 12 42 Q 18 12 40 12 Z",
    "M 40 10 Q 64 12 70 40 Q 72 70 40 72 Q 10 70 14 40 Q 16 10 40 10 Z",
  ],
  worried: [
    "M 40 14 Q 60 12 66 40 Q 70 66 40 70 Q 12 66 14 40 Q 18 14 40 14 Z",
    "M 40 12 Q 62 14 68 42 Q 72 68 40 72 Q 10 68 12 38 Q 16 12 40 12 Z",
  ],
};

const blobColors: Record<AvatarMood, string> = {
  neutral: "#818cf8",
  happy: "#4ade80",
  thinking: "#facc15",
  worried: "#fb923c",
};

const glowColors: Record<AvatarMood, string> = {
  neutral: "#a5b4fc",
  happy: "#86efac",
  thinking: "#fde68a",
  worried: "#fdba74",
};

export const BlobAvatar = ({ mood = "neutral", size = 120 }: BlobAvatarProps) => {
  const isBlinking = useBlinking();

  return (
    <motion.svg
      viewBox="0 0 80 85"
      width={size}
      height={size}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <defs>
        <motion.radialGradient id="blob-grad" cx="40%" cy="35%" r="55%">
          <motion.stop offset="0%" animate={{ stopColor: glowColors[mood] }} transition={{ duration: 0.5 }} />
          <motion.stop offset="100%" animate={{ stopColor: blobColors[mood] }} transition={{ duration: 0.5 }} />
        </motion.radialGradient>
        <filter id="blob-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* main blob */}
      <motion.path
        fill="url(#blob-grad)"
        filter="url(#blob-glow)"
        animate={{ d: blobPaths[mood] }}
        transition={{ duration: 2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />

      {/* inner shimmer */}
      <motion.ellipse
        cx={40} cy={36} rx={18} ry={14}
        fill="rgba(255,255,255,0.12)"
        animate={{ rx: [18, 16, 18], ry: [14, 16, 14] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* eyes */}
      <motion.circle
        cx={32} cy={38}
        r={isBlinking ? 0.5 : 3.5}
        fill="white"
        animate={{ r: isBlinking ? 0.5 : 3.5 }}
        transition={{ duration: 0.08 }}
      />
      <motion.circle
        cx={48} cy={38}
        r={isBlinking ? 0.5 : 3.5}
        fill="white"
        animate={{ r: isBlinking ? 0.5 : 3.5 }}
        transition={{ duration: 0.08 }}
      />
      {!isBlinking && (
        <>
          <circle cx={33} cy={37.5} r={1.5} fill="rgba(0,0,0,0.3)" />
          <circle cx={49} cy={37.5} r={1.5} fill="rgba(0,0,0,0.3)" />
        </>
      )}

      {/* mouth */}
      {mood === "happy" && (
        <motion.path d="M 35 48 q 5 5 10 0" stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round"
          animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {mood === "neutral" && (
        <line x1={36} y1={48} x2={44} y2={48} stroke="white" strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
      )}
      {mood === "worried" && (
        <path d="M 35 50 q 5 -4 10 0" stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.7} />
      )}
      {mood === "thinking" && (
        <motion.circle cx={40} cy={48} r={2} fill="white" opacity={0.6}
          animate={{ r: [2, 2.5, 2] }} transition={{ duration: 1, repeat: Infinity }}
        />
      )}

      {/* thinking particles */}
      {mood === "thinking" && (
        <motion.g animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 1.5, repeat: Infinity }}>
          <circle cx={64} cy={18} r={2} fill={blobColors.thinking} />
          <circle cx={68} cy={12} r={2.5} fill={blobColors.thinking} />
          <circle cx={72} cy={6} r={3} fill={blobColors.thinking} />
        </motion.g>
      )}
    </motion.svg>
  );
};
