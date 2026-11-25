import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/responder/application-pending")({
    head: () => beaconHead("Responder Application Pending", "Your BeaconMesh responder application is currently awaiting command review."),
    component: BeaconPage,
});
