import { motion } from "framer-motion";
import { useBlinking } from "./useBlinking";

export type AvatarMood = "neutral" | "happy" | "thinking" | "worried";

interface PixelAvatarProps {
  mood?: AvatarMood;
  size?: number;
}

const PIXEL = 4;

const mouthPaths: Record<AvatarMood, string> = {
  neutral: "M 20 32 h 8",
  happy: "M 20 30 q 4 6 8 0",
  thinking: "M 22 32 h 4",
  worried: "M 20 34 q 4 -4 8 0",
};

const bodyColor: Record<AvatarMood, string> = {
  neutral: "#6ee7b7",
  happy: "#fbbf24",
  thinking: "#93c5fd",
  worried: "#fca5a5",
};

export const PixelAvatar = ({ mood = "neutral", size = 120 }: PixelAvatarProps) => {
  const isBlinking = useBlinking();
  const eyeH = isBlinking ? 1 : PIXEL;
  const eyeY = isBlinking ? 24 : 22;

  return (
    <motion.svg
      viewBox="0 0 48 52"
      width={size}
      height={size}
      style={{ imageRendering: "pixelated" }}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* body */}
      <motion.rect
        x={8} y={12} width={32} height={28} rx={2}
        animate={{ fill: bodyColor[mood] }}
        transition={{ duration: 0.3 }}
      />
      {/* head highlight */}
      <rect x={12} y={14} width={24} height={4} fill="rgba(255,255,255,0.35)" />

      {/* left eye */}
      <motion.rect
        x={16} y={eyeY} width={PIXEL} height={eyeH} rx={0.5}
        fill="#1e293b"
        animate={{ height: eyeH, y: eyeY }}
        transition={{ duration: 0.08 }}
      />
      {/* right eye */}
      <motion.rect
        x={28} y={eyeY} width={PIXEL} height={eyeH} rx={0.5}
        fill="#1e293b"
        animate={{ height: eyeH, y: eyeY }}
        transition={{ duration: 0.08 }}
      />

      {/* eyebrows for worried */}
      {mood === "worried" && (
        <>
          <line x1={15} y1={19} x2={21} y2={20} stroke="#1e293b" strokeWidth={1.2} />
          <line x1={33} y1={19} x2={27} y2={20} stroke="#1e293b" strokeWidth={1.2} />
        </>
      )}

      {/* thinking dots */}
      {mood === "thinking" && (
        <motion.g animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
          <circle cx={36} cy={10} r={1.5} fill="#93c5fd" />
          <circle cx={40} cy={6} r={2} fill="#93c5fd" />
          <circle cx={44} cy={2} r={2.5} fill="#93c5fd" />
        </motion.g>
      )}

      {/* mouth */}
      <motion.path
        d={mouthPaths[mood]}
        stroke="#1e293b"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        animate={{ d: mouthPaths[mood] }}
        transition={{ duration: 0.25 }}
      />

      {/* feet */}
      <motion.rect
        x={14} y={40} width={6} height={4} rx={1} fill="#1e293b"
        animate={{ y: mood === "happy" ? [40, 38, 40] : 40 }}
        transition={{ duration: 0.4, repeat: mood === "happy" ? Infinity : 0, repeatType: "mirror" }}
      />
      <motion.rect
        x={28} y={40} width={6} height={4} rx={1} fill="#1e293b"
        animate={{ y: mood === "happy" ? [40, 42, 40] : 40 }}
        transition={{ duration: 0.4, repeat: mood === "happy" ? Infinity : 0, repeatType: "mirror" }}
      />
    </motion.svg>
  );
};
