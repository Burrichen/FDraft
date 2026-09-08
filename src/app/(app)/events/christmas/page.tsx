import type { Metadata } from "next";
import { ChristmasPageClient } from "./christmas-page-client";

export const metadata: Metadata = { title: "Christmas" };

export default function ChristmasPage() {
  return <ChristmasPageClient />;
}
