import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/about")({
  head: () =>
    beaconHead(
      "About BeaconMesh",
      "Learn about BeaconMesh and its educational emergency communication prototype.",
    ),
  component: BeaconPage,
});
