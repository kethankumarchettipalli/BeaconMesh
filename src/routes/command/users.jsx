import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/command/users")({
    head: () => beaconHead("Command User Management", "Review role-aware mock user controls in the command workspace."),
    component: BeaconPage,
});
