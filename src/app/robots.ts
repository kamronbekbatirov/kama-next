import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/miniapp", "/miniapp/", "/api/", "/api"],
      },
    ],
    host: "https://kama.uz",
    sitemap: "https://kama.uz/sitemap.xml",
  };
}
