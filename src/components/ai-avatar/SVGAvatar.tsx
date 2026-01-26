import { motion } from 'framer-motion';
import { AvatarMood } from './useAvatarMood';

interface SVGAvatarProps {
  isBlinking: boolean;
  mood?: AvatarMood;
  className?: string;
}

// Get eyebrow paths based on mood
const getEyebrowPaths = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      // Raised, curved upward (excited)
      return {
        left: "M 56 86 Q 68 80 80 86",
        right: "M 120 86 Q 132 80 144 86",
      };
    case 'thinking':
      // One raised, one neutral (curious)
      return {
        left: "M 58 90 Q 68 88 78 90",
        right: "M 120 84 Q 132 78 144 86",
      };
    case 'worried':
      // Angled inward (concerned)
      return {
        left: "M 56 84 Q 68 90 80 88",
        right: "M 120 88 Q 132 90 144 84",
      };
    case 'proud':
      // Confident, slightly raised
      return {
        left: "M 54 84 Q 68 80 82 84",
        right: "M 118 84 Q 132 80 146 84",
      };
    default: // neutral
      return {
        left: "M 58 88 Q 68 84 78 88",
        right: "M 122 88 Q 132 84 142 88",
      };
  }
};

// Get mouth path based on mood
const getMouthPath = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      // Big smile with open mouth
      return {
        path: "M 80 138 Q 100 160 120 138",
        fill: "#4a8080",
        strokeWidth: 0,
      };
    case 'thinking':
      // Slightly pursed, sideways
      return {
        path: "M 90 145 Q 100 143 115 148",
        fill: "none",
        strokeWidth: 3,
      };
    case 'worried':
      // Slight frown
      return {
        path: "M 85 150 Q 100 142 115 150",
        fill: "none",
        strokeWidth: 3,
      };
    case 'proud':
      // Confident smile
      return {
        path: "M 82 140 Q 100 158 118 140",
        fill: "none",
        strokeWidth: 3.5,
      };
    default: // neutral
      return {
        path: "M 85 140 Q 100 155 115 140",
        fill: "none",
        strokeWidth: 3,
      };
  }
};

// Get eye expression based on mood
const getEyeExpression = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      // Slightly squinted (happy eyes)
      return { scaleY: 0.9, translateY: 2 };
    case 'thinking':
      // Looking up/side
      return { scaleY: 1, translateY: 0, pupilOffset: { x: 3, y: -3 } };
    case 'worried':
      // Slightly wider
      return { scaleY: 1.05, translateY: 0 };
    case 'proud':
      // Normal but confident
      return { scaleY: 0.95, translateY: 1 };
    default:
      return { scaleY: 1, translateY: 0 };
  }
};

// Get cheek intensity based on mood
const getCheekOpacity = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      return 1;
    case 'proud':
      return 0.8;
    case 'worried':
      return 0.4;
    default:
      return 0.6;
  }
};

export const SVGAvatar = ({ isBlinking, mood = 'neutral', className }: SVGAvatarProps) => {
  const eyebrows = getEyebrowPaths(mood);
  const mouth = getMouthPath(mood);
  const eyeExpr = getEyeExpression(mood);
  const cheekOpacity = getCheekOpacity(mood);
  const pupilOffset = eyeExpr.pupilOffset || { x: 0, y: 0 };

  return (
    <svg
      viewBox="0 0 200 240"
      className={className}
      style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 200, 200, 0.3))' }}
    >
      <defs>
        {/* Gradients */}
        <radialGradient id="headGradient" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#f0fafa" />
          <stop offset="60%" stopColor="#d4f5f5" />
          <stop offset="100%" stopColor="#9de8e8" />
        </radialGradient>
        
        <radialGradient id="bodyGradient" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#d4f5f5" />
          <stop offset="100%" stopColor="#8dd8d8" />
        </radialGradient>
        
        <radialGradient id="eyeGradient" cx="40%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#1a4a5a" />
          <stop offset="50%" stopColor="#0d3a4a" />
          <stop offset="100%" stopColor="#082830" />
        </radialGradient>
        
        <radialGradient id="eyeRingGradient" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#2a8a9a" />
          <stop offset="100%" stopColor="#1a6a7a" />
        </radialGradient>
        
        <radialGradient id="haloGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#80efef" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#60dfdf" stopOpacity="0.4" />
        </radialGradient>
        
        <radialGradient id="cheekGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb8b8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffb8b8" stopOpacity="0" />
        </radialGradient>
        
        <linearGradient id="antennaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0fafa" />
          <stop offset="100%" stopColor="#c4e8e8" />
        </linearGradient>
      </defs>
      
      {/* Body */}
      <ellipse
        cx="100"
        cy="215"
        rx="28"
        ry="22"
        fill="url(#bodyGradient)"
      />
      
      {/* Head */}
      <ellipse
        cx="100"
        cy="115"
        rx="72"
        ry="68"
        fill="url(#headGradient)"
      />
      
      {/* Antenna stem */}
      <ellipse
        cx="145"
        cy="65"
        rx="8"
        ry="14"
        fill="url(#antennaGradient)"
        transform="rotate(30 145 65)"
      />
      
      {/* Halo */}
      <motion.g
        animate={{
          y: [0, -2, 0, -1, 0],
          rotate: [-5, 5, -3, 4, -5],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <ellipse
          cx="100"
          cy="30"
          rx="28"
          ry="8"
          fill="none"
          stroke="url(#haloGradient)"
          strokeWidth="4"
          opacity="0.9"
        />
        <ellipse
          cx="100"
          cy="30"
          rx="28"
          ry="8"
          fill="url(#haloGradient)"
          opacity="0.3"
        />
      </motion.g>
      
      {/* Eyebrows - animated based on mood */}
      <motion.path
        d={eyebrows.left}
        fill="none"
        stroke="#4a9a9a"
        strokeWidth="2.5"
        strokeLinecap="round"
        animate={{ d: eyebrows.left }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      <motion.path
        d={eyebrows.right}
        fill="none"
        stroke="#4a9a9a"
        strokeWidth="2.5"
        strokeLinecap="round"
        animate={{ d: eyebrows.right }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      
      {/* Left Eye */}
      <motion.g
        animate={{
          scaleY: eyeExpr.scaleY,
          translateY: eyeExpr.translateY,
        }}
        transition={{ duration: 0.3 }}
        style={{ transformOrigin: '68px 110px' }}
      >
        {/* Eye white/base */}
        <ellipse
          cx="68"
          cy="110"
          rx="18"
          ry="20"
          fill="#f8ffff"
        />
        
        {/* Iris ring */}
        <motion.ellipse
          cx={68 + pupilOffset.x}
          cy={112 + pupilOffset.y}
          rx="14"
          ry="16"
          fill="url(#eyeRingGradient)"
          animate={{ cx: 68 + pupilOffset.x, cy: 112 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Pupil */}
        <motion.ellipse
          cx={68 + pupilOffset.x}
          cy={112 + pupilOffset.y}
          rx="10"
          ry="12"
          fill="url(#eyeGradient)"
          animate={{ cx: 68 + pupilOffset.x, cy: 112 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Eye highlight */}
        <motion.ellipse
          cx={73 + pupilOffset.x}
          cy={106 + pupilOffset.y}
          rx="4"
          ry="5"
          fill="white"
          opacity="0.95"
          animate={{ cx: 73 + pupilOffset.x, cy: 106 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Eyelid (blink) */}
        <motion.ellipse
          cx="68"
          cy="110"
          rx="20"
          ry="22"
          fill="#d4f5f5"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: isBlinking ? 1 : 0 }}
          transition={{ duration: 0.08 }}
          style={{ transformOrigin: '68px 110px' }}
        />
        
        {/* Closed eye line (when blinking) */}
        <motion.path
          d="M 50 110 Q 68 118 86 110"
          fill="none"
          stroke="#4a9a9a"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: isBlinking ? 1 : 0 }}
          transition={{ duration: 0.08 }}
        />
      </motion.g>
      
      {/* Right Eye */}
      <motion.g
        animate={{
          scaleY: eyeExpr.scaleY,
          translateY: eyeExpr.translateY,
        }}
        transition={{ duration: 0.3 }}
        style={{ transformOrigin: '132px 110px' }}
      >
        {/* Eye white/base */}
        <ellipse
          cx="132"
          cy="110"
          rx="18"
          ry="20"
          fill="#f8ffff"
        />
        
        {/* Iris ring */}
        <motion.ellipse
          cx={132 + pupilOffset.x}
          cy={112 + pupilOffset.y}
          rx="14"
          ry="16"
          fill="url(#eyeRingGradient)"
          animate={{ cx: 132 + pupilOffset.x, cy: 112 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Pupil */}
        <motion.ellipse
          cx={132 + pupilOffset.x}
          cy={112 + pupilOffset.y}
          rx="10"
          ry="12"
          fill="url(#eyeGradient)"
          animate={{ cx: 132 + pupilOffset.x, cy: 112 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Eye highlight */}
        <motion.ellipse
          cx={137 + pupilOffset.x}
          cy={106 + pupilOffset.y}
          rx="4"
          ry="5"
          fill="white"
          opacity="0.95"
          animate={{ cx: 137 + pupilOffset.x, cy: 106 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Eyelid (blink) */}
        <motion.ellipse
          cx="132"
          cy="110"
          rx="20"
          ry="22"
          fill="#d4f5f5"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: isBlinking ? 1 : 0 }}
          transition={{ duration: 0.08 }}
          style={{ transformOrigin: '132px 110px' }}
        />
        
        {/* Closed eye line (when blinking) */}
        <motion.path
          d="M 114 110 Q 132 118 150 110"
          fill="none"
          stroke="#4a9a9a"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: isBlinking ? 1 : 0 }}
          transition={{ duration: 0.08 }}
        />
      </motion.g>
      
      {/* Cheeks - animated opacity based on mood */}
      <motion.ellipse
        cx="45"
        cy="125"
        rx="12"
        ry="8"
        fill="url(#cheekGradient)"
        animate={{ opacity: cheekOpacity }}
        transition={{ duration: 0.3 }}
      />
      <motion.ellipse
        cx="155"
        cy="125"
        rx="12"
        ry="8"
        fill="url(#cheekGradient)"
        animate={{ opacity: cheekOpacity }}
        transition={{ duration: 0.3 }}
      />
      
      {/* Mouth - animated based on mood */}
      <motion.path
        d={mouth.path}
        fill={mouth.fill}
        stroke={mouth.fill === "none" ? "#5a9090" : "none"}
        strokeWidth={mouth.strokeWidth}
        strokeLinecap="round"
        animate={{ d: mouth.path }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      
      {/* Happy mood: add teeth/tongue hint */}
      {mood === 'happy' && (
        <motion.ellipse
          cx="100"
          cy="148"
          rx="8"
          ry="4"
          fill="#ff9090"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        />
      )}
    </svg>
  );
};
