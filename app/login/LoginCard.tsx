"use client";

import { motion } from "framer-motion";

export default function LoginCard({
  subtitle,
  description,
  signInLabel,
  signInAction,
}: {
  subtitle: string;
  description: string;
  signInLabel: string;
  signInAction: () => Promise<void>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative z-10 w-full max-w-sm bg-white/80 backdrop-blur-sm border border-white/60 rounded-2xl shadow-xl px-10 py-12 flex flex-col items-center gap-6"
    >
      <div className="text-center">
        <div className="font-display text-3xl font-semibold text-ink mb-1">Plei</div>
        <div className="text-sm text-ink-muted">{subtitle}</div>
      </div>

      <div className="text-sm text-ink-faint max-w-xs text-center">{description}</div>

      <form action={signInAction}>
        <motion.button
          type="submit"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="flex items-center gap-3 rounded-full bg-white border border-border px-6 py-3 text-sm font-medium text-ink shadow-sm hover:shadow-md hover:border-border-strong transition-[box-shadow,border-color]"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.3C29.6 35.4 26.9 36 24 36c-5.3 0-9.8-3.4-11.3-8.1l-6.6 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.3 5.6-6.1 7.2l6.5 5.3C39.7 37.1 44 31.1 44 24c0-1.3-.1-2.7-.4-3.5z"
            />
          </svg>
          {signInLabel}
        </motion.button>
      </form>
    </motion.div>
  );
}
