import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/citizen/safe-zones")({
    head: () => beaconHead("Citizen Safe Zones", "Explore illustrative safety locations in the citizen workspace."),
    component: BeaconPage,
});
