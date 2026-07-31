import type { Metadata } from "next";
import { UploadClient } from "./upload-client";

/**
 * Public drop-box. The link is meant to be handed out (QR code), not crawled —
 * keeping it out of the index means it's shared deliberately rather than found.
 * All actual protection lives server-side in @/lib/uploads.
 */
export const metadata: Metadata = {
  title: "Send files — Kamronbek Batirov",
  description: "Upload photos, video, audio or documents straight to my inbox.",
  robots: { index: false, follow: false, nocache: true },
};

export default function UploadPage() {
  return <UploadClient />;
}
