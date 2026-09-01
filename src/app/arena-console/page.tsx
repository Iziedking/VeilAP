import type { Metadata } from "next";

import { VeilArenaConsole } from "@/components/veil-arena-console";

export const metadata: Metadata = {
  title: "Operator desk | Veil Arena",
  description: "Create a Veil Arena competition and open its separate control room.",
};

export default function ArenaConsolePage() {
  return <VeilArenaConsole />;
}
