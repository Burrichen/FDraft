import type { Metadata } from "next";
import { StudioPageClient } from "./studio-page-client";

export const metadata: Metadata = { title: "Event Studio" };

export default function StudioPage() {
  return <StudioPageClient />;
}
