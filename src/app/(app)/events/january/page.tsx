import type { Metadata } from "next";
import { JanuaryPageClient } from "./january-page-client";

export const metadata: Metadata = { title: "January" };

/**
 * A `"use client"` boundary is required in `JanuaryPageClient` — this
 * route stays a thin static Server Component, the same split Halloween's
 * and Christmas's own pages already use.
 */
export default function JanuaryPage() {
  return <JanuaryPageClient />;
}
