import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/routes/beacon-head";

export const Route = createFileRoute("/command/incidents")({
  head: () =>
    beaconHead("Command Incident Management", "Search and filter mock citizen incident records."),
  component: BeaconPage,
});
