import type { Metadata } from "next";
import { NewDraftView } from "./new-draft-view";

export const metadata: Metadata = { title: "New draft" };

export default function NewDraftPage() {
  return <NewDraftView />;
}
