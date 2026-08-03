import type { MetadataRoute } from "next";
import { getPublicWebBaseUrl, getPublicWebUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/login",
        "/register",
        "/verify-otp",
        "/verify-email",
        "/forgot-password",
        "/reset-password",
        "/complete-profile",
        "/discover",
        "/bookings",
        "/chat",
        "/profile",
        "/notifications",
        "/subscription",
        "/call/"
      ]
    },
    sitemap: getPublicWebUrl("/sitemap.xml"),
    host: getPublicWebBaseUrl()
  };
}
