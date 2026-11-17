import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/how-it-works")({
  head: () =>
    beaconHead(
      "How BeaconMesh Works",
      "See how a store-carry-forward message can move through a resilient network.",
    ),
  component: BeaconPage,
});
