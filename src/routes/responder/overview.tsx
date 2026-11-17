import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/responder/overview")({
  head: () =>
    beaconHead(
      "Responder Overview",
      "Review mock assignments and field operations in the responder workspace.",
    ),
  component: BeaconPage,
});
