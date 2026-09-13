import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Dogana Guest Portal",
    short_name: "La Dogana",
    description: "Private guest and apartment planning portal for La Dogana.",
    start_url: "/login",
    display: "standalone",
    background_color: "#F7F5F0",
    theme_color: "#304030",
  };
}
