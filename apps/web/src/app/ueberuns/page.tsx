import type { Metadata } from "next";
import { AlzagAboutPage } from "@/components/alzag/about/alzag-about-page";

export const metadata: Metadata = {
  title: "Uber uns | Alzag Consulting",
  description:
    "Lernen Sie Alzag Consulting kennen: Wir entwickeln Webseiten, Plattformen und Automationen fuer mehr Anfragen und effiziente Prozesse.",
};

export default function UeberUnsPage() {
  return <AlzagAboutPage />;
}
