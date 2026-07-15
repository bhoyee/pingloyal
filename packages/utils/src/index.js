"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTriggerEnabled = exports.PhoneNormalisationError = exports.maskPhone = exports.normalisePhone = exports.decrypt = exports.encrypt = void 0;
// Shared utility functions for PingLoyal
var encryption_1 = require("./encryption");
Object.defineProperty(exports, "encrypt", { enumerable: true, get: function () { return encryption_1.encrypt; } });
Object.defineProperty(exports, "decrypt", { enumerable: true, get: function () { return encryption_1.decrypt; } });
var phone_1 = require("./phone");
Object.defineProperty(exports, "normalisePhone", { enumerable: true, get: function () { return phone_1.normalisePhone; } });
Object.defineProperty(exports, "maskPhone", { enumerable: true, get: function () { return phone_1.maskPhone; } });
Object.defineProperty(exports, "PhoneNormalisationError", { enumerable: true, get: function () { return phone_1.PhoneNormalisationError; } });
var triggers_1 = require("./triggers");
Object.defineProperty(exports, "isTriggerEnabled", { enumerable: true, get: function () { return triggers_1.isTriggerEnabled; } });
//# sourceMappingURL=index.js.map