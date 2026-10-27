import type { Metadata } from "next";
import LandingFilm from "@/components/landing/film";

export const metadata: Metadata = {
  title: "Mailmaan — every app has something to say",
  description:
    "The email runtime for AI-built applications: AI-drafted templates sealed in your brand, event workflows, and truthful delivery timelines.",
};

export default function Home() {
  return <LandingFilm />;
}
