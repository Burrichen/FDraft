import type { Metadata } from "next";
import { HalloweenPageClient } from "./halloween-page-client";

export const metadata: Metadata = { title: "Halloween" };

export default function HalloweenPage() {
  return <HalloweenPageClient />;
}
