import type { Metadata } from "next";
import { ShareTarget } from "@/components/home/share-target";

export const metadata: Metadata = {
  title: "Add to a room",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Android share-sheet target (see app/manifest.ts).
export default async function SharePage(props: PageProps<"/share">) {
  const params = await props.searchParams;
  const title = first(params.title);
  const text = first(params.text);
  const url = first(params.url);
  // Many apps put the link inside `text` already; don't paste it twice.
  const body = [text, url && !text.includes(url) ? url : ""].filter(Boolean).join("\n");
  return <ShareTarget title={title} body={body} />;
}
