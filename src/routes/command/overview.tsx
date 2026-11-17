import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/command/overview")({
  head: () =>
    beaconHead(
      "Command Overview",
      "Review mock incident activity in the BeaconMesh command workspace.",
    ),
  component: BeaconPage,
});
