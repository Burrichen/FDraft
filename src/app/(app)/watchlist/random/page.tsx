import type { Metadata } from "next";
import { RandomFilmView } from "./random-film-view";

export const metadata: Metadata = { title: "Random film" };

export default function RandomFilmPage() {
  return <RandomFilmView />;
}
