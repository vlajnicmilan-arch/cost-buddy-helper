import { motion } from 'framer-motion';
import { useMemo } from 'react';
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
      return {
        left: "M 62 72 Q 72 66 82 72",
        right: "M 118 72 Q 128 66 138 72",
      };
    case 'thinking':
      return {
        left: "M 64 76 Q 72 74 80 76",
        right: "M 118 70 Q 128 64 138 72",
      };
    case 'worried':
      return {
        left: "M 62 70 Q 72 76 82 74",
        right: "M 118 74 Q 128 76 138 70",
      };
    case 'proud':
      return {
        left: "M 60 70 Q 72 64 84 70",
        right: "M 116 70 Q 128 64 140 70",
      };
    default: // neutral
      return {
        left: "M 64 74 Q 72 70 80 74",
        right: "M 120 74 Q 128 70 136 74",
      };
  }
};

// Get mouth path based on mood
const getMouthPath = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      return {
        path: "M 82 138 Q 100 155 118 138",
        fill: "#3a7a7a",
        strokeWidth: 0,
      };
    case 'thinking':
      return {
        path: "M 92 142 Q 100 140 112 145",
        fill: "none",
        strokeWidth: 2.5,
      };
    case 'worried':
      return {
        path: "M 88 147 Q 100 140 112 147",
        fill: "none",
        strokeWidth: 2.5,
      };
    case 'proud':
      return {
        path: "M 85 138 Q 100 152 115 138",
        fill: "none",
        strokeWidth: 2.5,
      };
    default: // neutral
      return {
        path: "M 88 138 Q 100 150 112 138",
        fill: "none",
        strokeWidth: 2.5,
      };
  }
};

// Get eye expression based on mood
const getEyeExpression = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      return { scaleY: 0.85, translateY: 2, pupilOffset: { x: 0, y: 0 } };
    case 'thinking':
      return { scaleY: 1, translateY: 0, pupilOffset: { x: 3, y: -2 } };
    case 'worried':
      return { scaleY: 1.05, translateY: 0, pupilOffset: { x: 0, y: 0 } };
    case 'proud':
      return { scaleY: 0.92, translateY: 1, pupilOffset: { x: 0, y: 0 } };
    default:
      return { scaleY: 1, translateY: 0, pupilOffset: { x: 0, y: 0 } };
  }
};

// Get cheek intensity based on mood
const getCheekOpacity = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      return 1;
    case 'proud':
      return 0.9;
    case 'worried':
      return 0.5;
    default:
      return 0.7;
  }
};

export const SVGAvatar = ({ isBlinking, mood = 'neutral', className }: SVGAvatarProps) => {
  const eyebrows = getEyebrowPaths(mood);
  const mouth = getMouthPath(mood);
  const eyeExpr = getEyeExpression(mood);
  const cheekOpacity = getCheekOpacity(mood);
  const pupilOffset = eyeExpr.pupilOffset || { x: 0, y: 0 };

  // Generate unique IDs for gradients to avoid conflicts
  const uniqueId = useMemo(() => Math.random().toString(36).substring(2, 9), []);

  return (
    <svg
      viewBox="0 0 200 220"
      className={className}
      style={{ 
        filter: 'drop-shadow(0 6px 16px rgba(80, 200, 200, 0.25))',
        colorScheme: 'light',
        WebkitFilter: 'none',
      }}
    >
      <defs>
        {/* Main body gradient - soft mint/cyan - SOLID COLORS */}
        <radialGradient id={`bodyGrad_${uniqueId}`} cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#e8fafa" stopOpacity="1" />
          <stop offset="50%" stopColor="#c5eded" stopOpacity="1" />
          <stop offset="100%" stopColor="#9ddede" stopOpacity="1" />
        </radialGradient>
        
        {/* Head gradient - SOLID COLORS */}
        <radialGradient id={`headGrad_${uniqueId}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f5ffff" stopOpacity="1" />
          <stop offset="40%" stopColor="#e8fafa" stopOpacity="1" />
          <stop offset="70%" stopColor="#d0f0f0" stopOpacity="1" />
          <stop offset="100%" stopColor="#a8e4e4" stopOpacity="1" />
        </radialGradient>
        
        {/* Eye white gradient */}
        <radialGradient id={`eyeWhiteGrad_${uniqueId}`} cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#f0f8f8" stopOpacity="1" />
        </radialGradient>
        
        {/* Iris gradient - deep teal/cyan */}
        <radialGradient id={`irisGrad_${uniqueId}`} cx="45%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#4db8c7" stopOpacity="1" />
          <stop offset="60%" stopColor="#2a98a8" stopOpacity="1" />
          <stop offset="100%" stopColor="#1a7888" stopOpacity="1" />
        </radialGradient>
        
        {/* Pupil gradient - very dark */}
        <radialGradient id={`pupilGrad_${uniqueId}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#1a4550" stopOpacity="1" />
          <stop offset="50%" stopColor="#0d2830" stopOpacity="1" />
          <stop offset="100%" stopColor="#051820" stopOpacity="1" />
        </radialGradient>
        
        {/* Halo gradient - glowing cyan - SOLID */}
        <linearGradient id={`haloGrad_${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#80f0f0" stopOpacity="1" />
          <stop offset="50%" stopColor="#60e8e8" stopOpacity="1" />
          <stop offset="100%" stopColor="#50e0e0" stopOpacity="1" />
        </linearGradient>
        
        {/* Cheek blush gradient */}
        <radialGradient id={`cheekGrad_${uniqueId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb8a8" stopOpacity="0.5" />
          <stop offset="70%" stopColor="#ffb8a8" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ffb8a8" stopOpacity="0" />
        </radialGradient>
        
        {/* Antenna gradient - SOLID */}
        <radialGradient id={`antennaGrad_${uniqueId}`} cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#f8ffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#d8f0f0" stopOpacity="1" />
        </radialGradient>
        
        {/* Eyelid gradient - SOLID for blink */}
        <radialGradient id={`eyelidGrad_${uniqueId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e0f5f5" stopOpacity="1" />
          <stop offset="100%" stopColor="#d0eeee" stopOpacity="1" />
        </radialGradient>
      </defs>
      
      {/* Body/Neck - mushroom-like shape */}
      <ellipse
        cx="100"
        cy="195"
        rx="26"
        ry="20"
        fill={`url(#bodyGrad_${uniqueId})`}
      />
      <ellipse
        cx="100"
        cy="180"
        rx="18"
        ry="12"
        fill={`url(#bodyGrad_${uniqueId})`}
      />
      
      {/* Head - main rounded shape */}
      <ellipse
        cx="100"
        cy="105"
        rx="68"
        ry="62"
        fill={`url(#headGrad_${uniqueId})`}
      />
      
      {/* Head highlight - top shine */}
      <ellipse
        cx="85"
        cy="70"
        rx="25"
        ry="12"
        fill="#ffffff"
        opacity="0.3"
      />
      
      {/* Antenna stem */}
      <ellipse
        cx="142"
        cy="58"
        rx="6"
        ry="12"
        fill={`url(#antennaGrad_${uniqueId})`}
        transform="rotate(25 142 58)"
      />
      
      {/* Floating Halo */}
      <motion.g
        animate={{
          y: [0, -3, 0, -2, 0],
          rotate: [-8, 8, -5, 6, -8],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ transformOrigin: '100px 25px' }}
      >
        {/* Halo outer ring */}
        <ellipse
          cx="100"
          cy="25"
          rx="26"
          ry="9"
          fill="none"
          stroke={`url(#haloGrad_${uniqueId})`}
          strokeWidth="5"
        />
        {/* Halo highlight */}
        <ellipse
          cx="88"
          cy="22"
          rx="8"
          ry="3"
          fill="#ffffff"
          opacity="0.5"
        />
      </motion.g>
      
      {/* Eyebrows */}
      <motion.path
        d={eyebrows.left}
        fill="none"
        stroke="#5a9a9a"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{ d: eyebrows.left }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      <motion.path
        d={eyebrows.right}
        fill="none"
        stroke="#5a9a9a"
        strokeWidth="2"
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
        style={{ transformOrigin: '72px 100px' }}
      >
        {/* Eye white/base */}
        <ellipse
          cx="72"
          cy="100"
          rx="18"
          ry="20"
          fill={`url(#eyeWhiteGrad_${uniqueId})`}
          stroke="#c0e8e8"
          strokeWidth="0.5"
        />
        
        {/* Iris - teal ring */}
        <motion.ellipse
          cx={72 + pupilOffset.x}
          cy={102 + pupilOffset.y}
          rx="14"
          ry="15"
          fill={`url(#irisGrad_${uniqueId})`}
          animate={{ cx: 72 + pupilOffset.x, cy: 102 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Pupil - dark center */}
        <motion.ellipse
          cx={72 + pupilOffset.x}
          cy={102 + pupilOffset.y}
          rx="9"
          ry="10"
          fill={`url(#pupilGrad_${uniqueId})`}
          animate={{ cx: 72 + pupilOffset.x, cy: 102 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Main eye highlight */}
        <motion.ellipse
          cx={78 + pupilOffset.x}
          cy={96 + pupilOffset.y}
          rx="4"
          ry="5"
          fill="#ffffff"
          animate={{ cx: 78 + pupilOffset.x, cy: 96 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Secondary eye highlight */}
        <motion.circle
          cx={68 + pupilOffset.x}
          cy={108 + pupilOffset.y}
          r="2"
          fill="#ffffff"
          opacity="0.6"
          animate={{ cx: 68 + pupilOffset.x, cy: 108 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Eyelid (blink) - solid color */}
        <motion.ellipse
          cx="72"
          cy="100"
          rx="19"
          ry="21"
          fill="#d8f2f2"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: isBlinking ? 1 : 0 }}
          transition={{ duration: 0.08 }}
          style={{ transformOrigin: '72px 100px' }}
        />
        
        {/* Closed eye line (when blinking) */}
        <motion.path
          d="M 54 100 Q 72 108 90 100"
          fill="none"
          stroke="#5a9a9a"
          strokeWidth="2"
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
        style={{ transformOrigin: '128px 100px' }}
      >
        {/* Eye white/base */}
        <ellipse
          cx="128"
          cy="100"
          rx="18"
          ry="20"
          fill={`url(#eyeWhiteGrad_${uniqueId})`}
          stroke="#c0e8e8"
          strokeWidth="0.5"
        />
        
        {/* Iris - teal ring */}
        <motion.ellipse
          cx={128 + pupilOffset.x}
          cy={102 + pupilOffset.y}
          rx="14"
          ry="15"
          fill={`url(#irisGrad_${uniqueId})`}
          animate={{ cx: 128 + pupilOffset.x, cy: 102 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Pupil - dark center */}
        <motion.ellipse
          cx={128 + pupilOffset.x}
          cy={102 + pupilOffset.y}
          rx="9"
          ry="10"
          fill={`url(#pupilGrad_${uniqueId})`}
          animate={{ cx: 128 + pupilOffset.x, cy: 102 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Main eye highlight */}
        <motion.ellipse
          cx={134 + pupilOffset.x}
          cy={96 + pupilOffset.y}
          rx="4"
          ry="5"
          fill="#ffffff"
          animate={{ cx: 134 + pupilOffset.x, cy: 96 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Secondary eye highlight */}
        <motion.circle
          cx={124 + pupilOffset.x}
          cy={108 + pupilOffset.y}
          r="2"
          fill="#ffffff"
          opacity="0.6"
          animate={{ cx: 124 + pupilOffset.x, cy: 108 + pupilOffset.y }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Eyelid (blink) - solid color */}
        <motion.ellipse
          cx="128"
          cy="100"
          rx="19"
          ry="21"
          fill="#d8f2f2"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: isBlinking ? 1 : 0 }}
          transition={{ duration: 0.08 }}
          style={{ transformOrigin: '128px 100px' }}
        />
        
        {/* Closed eye line (when blinking) */}
        <motion.path
          d="M 110 100 Q 128 108 146 100"
          fill="none"
          stroke="#5a9a9a"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: isBlinking ? 1 : 0 }}
          transition={{ duration: 0.08 }}
        />
      </motion.g>
      
      {/* Cheeks - soft blush */}
      <motion.ellipse
        cx="48"
        cy="115"
        rx="12"
        ry="8"
        fill={`url(#cheekGrad_${uniqueId})`}
        animate={{ opacity: cheekOpacity }}
        transition={{ duration: 0.3 }}
      />
      <motion.ellipse
        cx="152"
        cy="115"
        rx="12"
        ry="8"
        fill={`url(#cheekGrad_${uniqueId})`}
        animate={{ opacity: cheekOpacity }}
        transition={{ duration: 0.3 }}
      />
      
      {/* Mouth */}
      <motion.path
        d={mouth.path}
        fill={mouth.fill}
        stroke={mouth.fill === "none" ? "#4a8888" : "none"}
        strokeWidth={mouth.strokeWidth}
        strokeLinecap="round"
        animate={{ d: mouth.path }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      
      {/* Happy mood: add tongue hint */}
      {mood === 'happy' && (
        <motion.ellipse
          cx="100"
          cy="146"
          rx="6"
          ry="3"
          fill="#ff8080"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.8, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        />
      )}
    </svg>
  );
};
