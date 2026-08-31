import type { Metadata } from "next";

import { ArenaLobby } from "@/components/arena/arena-lobby";

export const metadata: Metadata = {
  title: "Competition floor | Veil Arena",
  description: "Enter an open sealed-agent competition or watch a persisted match.",
};

export default function ArenaPage() {
  return <ArenaLobby />;
}
