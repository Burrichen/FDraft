import type { Metadata } from "next";
import { OneAtATimeRouteView } from "./one-at-a-time-route-view";

export const metadata: Metadata = { title: "One At A Time draft" };

export default function OneAtATimeDraftPage() {
  return <OneAtATimeRouteView />;
}
