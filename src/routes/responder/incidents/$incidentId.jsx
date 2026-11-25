import { createFileRoute } from "@tanstack/react-router";
import { BeaconPage } from "@/components/beaconmesh/app";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/responder/incidents/$incidentId")({
    head: () => beaconHead("Responder Incident Details", "Review a mock incident detail and status in the responder workspace."),
    component: BeaconPage,
});
