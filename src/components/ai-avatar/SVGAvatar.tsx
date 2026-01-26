import { motion } from 'framer-motion';

interface SVGAvatarProps {
  isBlinking: boolean;
  className?: string;
}

export const SVGAvatar = ({ isBlinking, className }: SVGAvatarProps) => {
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
      
      {/* Eyebrows */}
      <path
        d="M 58 88 Q 68 84 78 88"
        fill="none"
        stroke="#4a9a9a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M 122 88 Q 132 84 142 88"
        fill="none"
        stroke="#4a9a9a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      
      {/* Left Eye */}
      <g>
        {/* Eye white/base */}
        <ellipse
          cx="68"
          cy="110"
          rx="18"
          ry="20"
          fill="#f8ffff"
        />
        
        {/* Iris ring */}
        <ellipse
          cx="68"
          cy="112"
          rx="14"
          ry="16"
          fill="url(#eyeRingGradient)"
        />
        
        {/* Pupil */}
        <ellipse
          cx="68"
          cy="112"
          rx="10"
          ry="12"
          fill="url(#eyeGradient)"
        />
        
        {/* Eye highlight */}
        <ellipse
          cx="73"
          cy="106"
          rx="4"
          ry="5"
          fill="white"
          opacity="0.95"
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
      </g>
      
      {/* Right Eye */}
      <g>
        {/* Eye white/base */}
        <ellipse
          cx="132"
          cy="110"
          rx="18"
          ry="20"
          fill="#f8ffff"
        />
        
        {/* Iris ring */}
        <ellipse
          cx="132"
          cy="112"
          rx="14"
          ry="16"
          fill="url(#eyeRingGradient)"
        />
        
        {/* Pupil */}
        <ellipse
          cx="132"
          cy="112"
          rx="10"
          ry="12"
          fill="url(#eyeGradient)"
        />
        
        {/* Eye highlight */}
        <ellipse
          cx="137"
          cy="106"
          rx="4"
          ry="5"
          fill="white"
          opacity="0.95"
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
      </g>
      
      {/* Cheeks */}
      <ellipse
        cx="45"
        cy="125"
        rx="12"
        ry="8"
        fill="url(#cheekGradient)"
      />
      <ellipse
        cx="155"
        cy="125"
        rx="12"
        ry="8"
        fill="url(#cheekGradient)"
      />
      
      {/* Smile */}
      <path
        d="M 85 140 Q 100 155 115 140"
        fill="none"
        stroke="#5a9090"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
};
