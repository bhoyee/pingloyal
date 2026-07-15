"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTriggerEnabled = isTriggerEnabled;
// A trigger type is enabled unless the tenant has explicitly disabled it.
function isTriggerEnabled(enabledTriggers, type) {
    return enabledTriggers?.[type] !== false;
}
//# sourceMappingURL=triggers.js.map