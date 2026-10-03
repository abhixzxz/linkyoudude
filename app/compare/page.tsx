import type { Metadata } from "next";
import { CompareLoader } from "./compare-loader";

export const metadata: Metadata = {
  title: "Compare",
  description: "Paste two versions of a text and see exactly what changed, line by line and word by word.",
};

export default function ComparePage() {
  return <CompareLoader />;
}
