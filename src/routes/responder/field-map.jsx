import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/responder/field-map")({
    head: () => beaconHead("Responder Field Map", "Explore illustrative field locations in the responder workspace."),
    component: BeaconPage,
});
