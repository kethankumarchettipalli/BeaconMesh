import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/responder/status")({
  head: () => beaconHead("Responder Status", "Update preview availability and field status."),
  component: BeaconPage,
});
