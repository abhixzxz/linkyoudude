import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Link Your Dude",
    short_name: "LinkYourDude",
    description:
      "A live clipboard between your devices. Paste on your laptop, copy on your phone.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f8",
    theme_color: "#f5f5f8",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Installed on Android, the app shows up in the system share sheet:
    // share text from any app straight into one of your rooms.
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
