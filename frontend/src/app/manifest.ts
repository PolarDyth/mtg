import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cardessa",
    short_name: "Cardessa",
    description:
      "A no-rules-enforced virtual tabletop for Magic: The Gathering",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#18181b",
    icons: [
      { src: "/icon", sizes: "48x48", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
