import { motion } from "framer-motion";
import { useBlinking } from "./useBlinking";

export type AvatarMood = "neutral" | "happy" | "thinking" | "worried";

interface FoxAvatarProps {
  mood?: AvatarMood;
  size?: number;
}

const earRotation: Record<AvatarMood, [number, number]> = {
  neutral: [0, 0],
  happy: [-8, 8],
  thinking: [-15, 5],
  worried: [12, -12],
};

const mouthPaths: Record<AvatarMood, string> = {
  neutral: "M 36 58 q 4 2 8 0",
  happy: "M 34 56 q 6 8 12 0",
  thinking: "M 38 58 a 2 2 0 1 0 4 0",
  worried: "M 36 60 q 4 -4 8 0",
};

export const FoxAvatar = ({ mood = "neutral", size = 120 }: FoxAvatarProps) => {
  const isBlinking = useBlinking();

  return (
    <motion.svg
      viewBox="0 0 80 90"
      width={size}
      height={size}
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* left ear */}
      <motion.polygon
        points="22,30 16,8 34,24"
        fill="#f97316"
        animate={{ rotate: earRotation[mood][0] }}
        transition={{ duration: 0.4, type: "spring" }}
        style={{ transformOrigin: "28px 28px" }}
      />
      <polygon points="24,26 19,14 32,24" fill="#fef3c7" />

      {/* right ear */}
      <motion.polygon
        points="58,30 64,8 46,24"
        fill="#f97316"
        animate={{ rotate: earRotation[mood][1] }}
        transition={{ duration: 0.4, type: "spring" }}
        style={{ transformOrigin: "52px 28px" }}
      />
      <polygon points="56,26 61,14 48,24" fill="#fef3c7" />

      {/* head */}
      <ellipse cx={40} cy={42} rx={22} ry={20} fill="#f97316" />
      {/* face mask */}
      <ellipse cx={40} cy={48} rx={14} ry={14} fill="#fef3c7" />

      {/* eyes */}
      {isBlinking ? (
        <>
          <line x1={31} y1={40} x2={37} y2={40} stroke="#1e293b" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={43} y1={40} x2={49} y2={40} stroke="#1e293b" strokeWidth={1.5} strokeLinecap="round" />
        </>
      ) : (
        <>
          <motion.ellipse
            cx={34} cy={40} rx={3.5} ry={mood === "happy" ? 2 : 3.5}
            fill="#1e293b"
            animate={{ ry: mood === "happy" ? 2 : 3.5 }}
            transition={{ duration: 0.2 }}
          />
          <circle cx={35.5} cy={39} r={1.2} fill="white" />
          <motion.ellipse
            cx={46} cy={40} rx={3.5} ry={mood === "happy" ? 2 : 3.5}
            fill="#1e293b"
            animate={{ ry: mood === "happy" ? 2 : 3.5 }}
            transition={{ duration: 0.2 }}
          />
          <circle cx={47.5} cy={39} r={1.2} fill="white" />
        </>
      )}

      {/* nose */}
      <ellipse cx={40} cy={50} rx={2.5} ry={2} fill="#1e293b" />

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

      {/* cheeks when happy */}
      {mood === "happy" && (
        <>
          <circle cx={26} cy={46} r={3} fill="#fda4af" opacity={0.5} />
          <circle cx={54} cy={46} r={3} fill="#fda4af" opacity={0.5} />
        </>
      )}

      {/* tail */}
      <motion.path
        d="M 56 68 q 12 -4 16 -14 q 2 -4 -2 -4 q -6 8 -14 10"
        fill="#f97316"
        animate={{
          d: mood === "happy"
            ? ["M 56 68 q 12 -4 16 -14 q 2 -4 -2 -4 q -6 8 -14 10", "M 56 68 q 16 -2 18 -16 q 2 -4 -2 -4 q -8 10 -16 12", "M 56 68 q 12 -4 16 -14 q 2 -4 -2 -4 q -6 8 -14 10"]
            : "M 56 68 q 12 -4 16 -14 q 2 -4 -2 -4 q -6 8 -14 10"
        }}
        transition={{ duration: 0.5, repeat: mood === "happy" ? Infinity : 0 }}
      />
      {/* tail tip */}
      <motion.circle cx={70} cy={52} r={3} fill="#fef3c7"
        animate={{ cx: mood === "happy" ? [70, 74, 70] : 70 }}
        transition={{ duration: 0.5, repeat: mood === "happy" ? Infinity : 0 }}
      />

      {/* thinking bubbles */}
      {mood === "thinking" && (
        <motion.g animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
          <circle cx={64} cy={26} r={2} fill="#fdba74" />
          <circle cx={68} cy={20} r={2.5} fill="#fdba74" />
          <circle cx={72} cy={14} r={3} fill="#fdba74" />
        </motion.g>
      )}

      {/* body */}
      <ellipse cx={40} cy={72} rx={16} ry={10} fill="#f97316" />
      <ellipse cx={40} cy={74} rx={10} ry={6} fill="#fef3c7" />
    </motion.svg>
  );
};
