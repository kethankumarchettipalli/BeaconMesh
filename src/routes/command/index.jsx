import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { beaconHead } from "@/lib/beacon-head";
export const Route = createFileRoute("/command/")({
    head: () => beaconHead("Command Workspace", "Open the shared BeaconMesh command workspace."),
    component: () => <Navigate to="/command/overview"/>,
});
