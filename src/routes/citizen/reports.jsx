import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/citizen/reports")({
    head: () => beaconHead("Citizen Reports", "Review and filter mock incident reports in the citizen workspace."),
    component: BeaconPage,
});
