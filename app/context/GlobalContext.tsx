"use client";

import { createContext, useContext, useState } from "react";

type GlobalContextType = {
  region: string;
  year: string;
  month: string;
  setRegion: (value: string) => void;
  setYear: (value: string) => void;
  setMonth: (value: string) => void;
};

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export function GlobalProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState("All");
  const [year, setYear] = useState("2025");
  const [month, setMonth] = useState("All");

  return (
    <GlobalContext.Provider
      value={{ region, year, month, setRegion, setYear, setMonth }}
    >
      {children}
    </GlobalContext.Provider>
  );
}

export function useGlobal() {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error("useGlobal must be used inside GlobalProvider");
  }
  return context;
}