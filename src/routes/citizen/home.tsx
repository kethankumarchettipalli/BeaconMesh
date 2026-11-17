import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/citizen/home")({
  head: () =>
    beaconHead(
      "Citizen Home and SOS",
      "Create and track a local mock emergency report in the citizen workspace.",
    ),
  component: BeaconPage,
});
