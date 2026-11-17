import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/")({
  head: () =>
    beaconHead(
      "BeaconMesh — Every Signal Finds Its Way",
      "Explore BeaconMesh, an offline-first emergency communication prototype.",
    ),
  component: BeaconPage,
});
