import type { Metadata } from "next";
import { OneAtATimeBuilderView } from "./one-at-a-time-builder-view";

export const metadata: Metadata = { title: "One At A Time draft" };

export default function OneAtATimeDraftPage() {
  return <OneAtATimeBuilderView />;
}
