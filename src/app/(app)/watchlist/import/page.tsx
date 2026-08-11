import type { Metadata } from "next";
import { ImportView } from "./import-view";

export const metadata: Metadata = { title: "Import watchlist" };

export default function ImportWatchlistPage() {
  return <ImportView />;
}
