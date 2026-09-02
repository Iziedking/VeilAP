import type { Metadata } from "next";

import { VeilProfile } from "@/components/veil-profile";

export const metadata: Metadata = {
  title: "Your profile | Veil Arena",
  description: "Review your verified identity, sealed agents, and competition history.",
};

export default function ProfilePage() {
  return <VeilProfile />;
}
