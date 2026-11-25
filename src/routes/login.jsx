import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/login")({
    head: () => beaconHead("Sign In Preview", "Choose a BeaconMesh workspace in the preview experience."),
    component: BeaconPage,
});
