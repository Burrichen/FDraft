import type { Metadata } from "next";
import { WatchlistView } from "./watchlist-view";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return <WatchlistView />;
}
