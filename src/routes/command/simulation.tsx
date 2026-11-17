import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/command/simulation")({
  head: () =>
    beaconHead("Simulation Laboratory", "Explore the educational BeaconMesh network simulation."),
  component: BeaconPage,
});
