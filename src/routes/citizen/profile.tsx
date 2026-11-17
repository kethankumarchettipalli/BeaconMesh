import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/citizen/profile")({
  head: () => beaconHead("Citizen Profile", "Review preview profile details and preferences."),
  component: BeaconPage,
});
