import type { Metadata } from "next";
import { DiySelectionView } from "./diy-selection-view";

export const metadata: Metadata = { title: "Build your own draft" };

export default function DiyDraftPage() {
  return <DiySelectionView />;
}
