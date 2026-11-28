import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/command/profile")({
    head: () => beaconHead("Command Profile", "Review command authority details and update personal contact details."),
    component: BeaconPage,
});
