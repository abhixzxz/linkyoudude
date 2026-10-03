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
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
    // Long-press the app icon for a one-tap new room.
    shortcuts: [
      {
        name: "New room",
        short_name: "New room",
        description: "Create a fresh room",
        url: "/new",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Compare texts",
        short_name: "Compare",
        description: "See what changed between two versions",
        url: "/compare",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    // Reopening the installed app (or sharing into it) reuses the open window.
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    // Shown in the richer install dialog on Android and desktop Chrome.
    screenshots: [
      {
        src: "/screenshots/phone.png",
        sizes: "780x1688",
        type: "image/png",
        form_factor: "narrow",
        label: "A room on your phone: tap Copy and go",
      },
      {
        src: "/screenshots/desktop.png",
        sizes: "1440x900",
        type: "image/png",
        form_factor: "wide",
        label: "Notes sidebar and editor on your laptop",
      },
    ],
  };
}
