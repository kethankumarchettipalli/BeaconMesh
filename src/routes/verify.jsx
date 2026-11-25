import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/verify")({
    head: () => beaconHead("Email Verification Preview", "View the BeaconMesh email verification preview screen."),
    component: BeaconPage,
});
