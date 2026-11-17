import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/command/messages")({
  head: () =>
    beaconHead(
      "Simulation Message Intelligence",
      "Review mock message activity kept separate from citizen incident records.",
    ),
  component: BeaconPage,
});
