export function beaconHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} | BeaconMesh` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | BeaconMesh` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
