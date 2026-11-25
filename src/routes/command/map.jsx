import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/command/map")({
    head: () => beaconHead("Command Operations Map", "Explore illustrative locations in the command workspace."),
    component: BeaconPage,
});
