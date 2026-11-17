import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/signup")({
  head: () =>
    beaconHead(
      "Create a Preview Account",
      "Explore the BeaconMesh prototype with a local preview account flow.",
    ),
  component: BeaconPage,
});
