/**
 * Simulation Event Phases and Event Definitions
 *
 * Ordered phase priority determines deterministic intra-millisecond scheduling.
 */
export var EventPhase;
(function (EventPhase) {
    EventPhase[EventPhase["ENVIRONMENT"] = 1] = "ENVIRONMENT";
    EventPhase[EventPhase["MOBILITY"] = 2] = "MOBILITY";
    EventPhase[EventPhase["NEIGHBOR"] = 3] = "NEIGHBOR";
    EventPhase[EventPhase["CREATION"] = 4] = "CREATION";
    EventPhase[EventPhase["ROUTING"] = 5] = "ROUTING";
    EventPhase[EventPhase["TRANSMISSION"] = 6] = "TRANSMISSION";
    EventPhase[EventPhase["CLEANUP"] = 7] = "CLEANUP";
})(EventPhase || (EventPhase = {}));
