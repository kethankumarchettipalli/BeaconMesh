import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/responder/profile")({
    head: () => beaconHead("Responder Profile", "Review responder credentials and update personal contact details."),
    component: BeaconPage,
});
