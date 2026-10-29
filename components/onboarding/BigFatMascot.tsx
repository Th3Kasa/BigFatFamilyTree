"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  /** "hello": eyes open (the first step). "happy": eyes closed, laughing (the last step). */
  mood: "hello" | "happy";
  size?: number;
  className?: string;
};

/**
 * Big Fat, the friendly cow who hosts the welcome tour. Decorative: always
 * aria-hidden, with the words carried by the tour copy. Bobs gently, and tilts
 * her head (with a little ear wiggle) each time she appears on a new step.
 */
export function BigFatMascot({ mood, size = 150, className }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={cn("shrink-0", className)}
      style={{ width: size, height: size, transformOrigin: "50% 80%" }}
      initial={reduce ? false : { rotate: 0 }}
      animate={reduce ? undefined : { rotate: [0, -9, 6, -3, 0] }}
      transition={{ duration: 0.9, ease: "easeInOut" }}
    >
      {/* Bob on an inner layer so it never fights the head-tilt transform. */}
      <div className="tour-bob">
      <svg width={size} height={size} viewBox="0 0 150 150">
        <ellipse cx="75" cy="143" rx="44" ry="6" fill="#F1E8E5" />
        {/* Horns */}
        <path d="M46 42 Q38 24 51 21 Q51 33 56 40Z" fill="#F2D49B" stroke="#241517" strokeWidth="2.5" />
        <path d="M104 42 Q112 24 99 21 Q99 33 94 40Z" fill="#F2D49B" stroke="#241517" strokeWidth="2.5" />
        {/* Ears */}
        <g className="tour-ear-left">
          <ellipse cx="30" cy="60" rx="17" ry="9" fill="#FFFFFF" stroke="#241517" strokeWidth="3" transform="rotate(-22 30 60)" />
        </g>
        <g className="tour-ear-right">
          <ellipse cx="120" cy="60" rx="17" ry="9" fill="#FFFFFF" stroke="#241517" strokeWidth="3" transform="rotate(22 120 60)" />
        </g>
        {/* Head and patches */}
        <rect x="40" y="34" width="70" height="80" rx="34" fill="#FFFFFF" stroke="#241517" strokeWidth="3" />
        <path d="M45 54 Q52 39 67 43 Q63 59 47 65Z" fill="#241517" />
        <circle cx="97" cy="50" r="8" fill="#241517" />
        {/* Eyes */}
        {mood === "hello" ? (
          <>
            <circle cx="62" cy="71" r="5.5" fill="#241517" />
            <circle cx="88" cy="71" r="5.5" fill="#241517" />
            <circle cx="63.8" cy="69" r="1.8" fill="#FFFFFF" />
            <circle cx="89.8" cy="69" r="1.8" fill="#FFFFFF" />
          </>
        ) : (
          <>
            <path d="M56 72 Q62 64 68 72" stroke="#241517" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M82 72 Q88 64 94 72" stroke="#241517" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        )}
        {/* Muzzle */}
        <ellipse cx="75" cy="99" rx="31" ry="18" fill="#F6B5BE" stroke="#241517" strokeWidth="3" />
        <ellipse cx="64" cy="96" rx="4" ry="5" fill="#B5606E" />
        <ellipse cx="86" cy="96" rx="4" ry="5" fill="#B5606E" />
        {mood === "hello" ? (
          <path d="M67 107 Q75 113 83 107" stroke="#241517" strokeWidth="3" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M66 105 Q75 118 84 105 Z" fill="#241517" />
        )}
        {/* Cheeks */}
        <circle cx="47" cy="84" r="5" fill="#F6B5BE" opacity=".8" />
        <circle cx="103" cy="84" r="5" fill="#F6B5BE" opacity=".8" />
      </svg>
      </div>
    </motion.div>
  );
}
