import type { Metadata } from "next";
import { EventPageView } from "@/components/events/event-page-view";
import { F_YOU_ITS_JANUARY_EVENT_ID } from "@/domain/events/event-registry";

export const metadata: Metadata = { title: "January" };

export default function JanuaryPage() {
  return <EventPageView eventId={F_YOU_ITS_JANUARY_EVENT_ID} />;
}
