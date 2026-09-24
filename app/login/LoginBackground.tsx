"use client";

import { motion } from "framer-motion";

// Puramente decorativo (pointer-events-none, sin contenido) — el drift lento
// le da vida a la pantalla de login sin competir con el único elemento
// realmente interactivo, que es el botón de acceso.
export default function LoginBackground() {
  return (
    <>
      <motion.div
        className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-brand/10 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] w-96 h-96 rounded-full bg-accent/20 blur-3xl"
        animate={{ x: [0, -25, 0], y: [0, -15, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute top-1/3 right-1/4 w-40 h-40 rounded-full bg-brand/5 blur-2xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}
