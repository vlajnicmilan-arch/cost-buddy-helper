import { motion } from "framer-motion";
import { useBlinking } from "./useBlinking";

export type AvatarMood = "neutral" | "happy" | "thinking" | "worried";

interface RobotAvatarProps {
  mood?: AvatarMood;
  size?: number;
}

const eyeGlow: Record<AvatarMood, string> = {
  neutral: "#60a5fa",
  happy: "#4ade80",
  thinking: "#facc15",
  worried: "#f87171",
};

const mouthPaths: Record<AvatarMood, string> = {
  neutral: "M 30 62 h 20",
  happy: "M 30 60 q 10 8 20 0",
  thinking: "M 35 62 h 10",
  worried: "M 30 64 q 10 -6 20 0",
};

export const RobotAvatar = ({ mood = "neutral", size = 120 }: RobotAvatarProps) => {
  const isBlinking = useBlinking();

  return (
    <motion.svg
      viewBox="0 0 80 90"
      width={size}
      height={size}
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* antenna */}
      <motion.line
        x1={40} y1={8} x2={40} y2={20}
        stroke="#94a3b8"
        strokeWidth={2}
        animate={{ x2: mood === "thinking" ? [38, 42, 38] : 40 }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
      <motion.circle
        cx={40} cy={6} r={3}
        animate={{ fill: eyeGlow[mood] }}
        transition={{ duration: 0.3 }}
      />

      {/* head */}
      <rect x={18} y={20} width={44} height={36} rx={10} fill="#334155" />
      <rect x={22} y={24} width={36} height={4} rx={2} fill="rgba(255,255,255,0.08)" />

      {/* visor */}
      <rect x={24} y={32} width={32} height={16} rx={6} fill="#1e293b" />

      {/* eyes */}
      <motion.circle
        cx={34} cy={40} r={isBlinking ? 0.5 : 4}
        animate={{ fill: eyeGlow[mood], r: isBlinking ? 0.5 : 4 }}
        transition={{ duration: 0.1 }}
      />
      <motion.circle
        cx={46} cy={40} r={isBlinking ? 0.5 : 4}
        animate={{ fill: eyeGlow[mood], r: isBlinking ? 0.5 : 4 }}
        transition={{ duration: 0.1 }}
      />
      {/* eye glow */}
      {!isBlinking && (
        <>
          <motion.circle cx={34} cy={40} r={6} fill="none" animate={{ stroke: eyeGlow[mood] }} strokeWidth={0.8} opacity={0.4} />
          <motion.circle cx={46} cy={40} r={6} fill="none" animate={{ stroke: eyeGlow[mood] }} strokeWidth={0.8} opacity={0.4} />
        </>
      )}

      {/* mouth */}
      <motion.path
        d={mouthPaths[mood]}
        stroke="#94a3b8"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        animate={{ d: mouthPaths[mood] }}
        transition={{ duration: 0.25 }}
      />

      {/* body */}
      <rect x={26} y={58} width={28} height={20} rx={6} fill="#475569" />
      <motion.rect
        x={34} y={64} width={12} height={8} rx={3}
        animate={{ fill: eyeGlow[mood], opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />

      {/* arms */}
      <motion.rect
        x={14} y={60} width={10} height={4} rx={2} fill="#64748b"
        animate={{ rotate: mood === "happy" ? [0, -15, 0] : 0 }}
        transition={{ duration: 0.6, repeat: mood === "happy" ? Infinity : 0 }}
        style={{ transformOrigin: "24px 62px" }}
      />
      <motion.rect
        x={56} y={60} width={10} height={4} rx={2} fill="#64748b"
        animate={{ rotate: mood === "happy" ? [0, 15, 0] : 0 }}
        transition={{ duration: 0.6, repeat: mood === "happy" ? Infinity : 0 }}
        style={{ transformOrigin: "56px 62px" }}
      />

      {/* thinking gear */}
      {mood === "thinking" && (
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "66px 24px" }}
        >
          <circle cx={66} cy={24} r={5} fill="none" stroke="#facc15" strokeWidth={1.5} />
          <rect x={64} y={18} width={4} height={3} rx={1} fill="#facc15" />
          <rect x={64} y={27} width={4} height={3} rx={1} fill="#facc15" />
          <rect x={59} y={22} width={3} height={4} rx={1} fill="#facc15" />
          <rect x={70} y={22} width={3} height={4} rx={1} fill="#facc15" />
        </motion.g>
      )}
    </motion.svg>
  );
};
