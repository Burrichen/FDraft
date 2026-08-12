import type { Metadata } from "next";
import { UnresolvedMetadataView } from "./unresolved-metadata-view";

export const metadata: Metadata = { title: "Unresolved metadata" };

export default function UnresolvedMetadataPage() {
  return <UnresolvedMetadataView />;
}
