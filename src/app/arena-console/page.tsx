import type { Metadata } from "next";

import { VeilArenaConsole } from "@/components/veil-arena-console";

export const metadata: Metadata = {
  title: "Operator desk | Veil Arena",
  description: "Create seasons, lock draws, and run persisted Veil Arena pairings.",
};

export default function ArenaConsolePage() {
  return <VeilArenaConsole />;
}
