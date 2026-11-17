import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/forgot-password")({
  head: () =>
    beaconHead("Password Recovery Preview", "View the BeaconMesh password recovery preview flow."),
  component: BeaconPage,
});
