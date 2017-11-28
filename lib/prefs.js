const Prefs = require('sdk/simple-prefs').prefs;

// List of all preference names
const prefNoiseReductionLevel = "noise-reduction-level";
const prefCompressOnSave = "compress-on-save";
const prefUpscaleOnce = "upscale-once";
const prefMaxAreaUpscaleOnce = "max-area-upscale-once";
const prefNotificationsDisabled = "disable-notifications";

exports.getNoiseLevel = function() {
    return Prefs[prefNoiseReductionLevel];
}

exports.getCompressionOnSave = function() {
    return Prefs[prefCompressOnSave] / 100;
}

exports.onlyUpscaleOnce = function() {
    return !Prefs[prefUpscaleOnce];
}

exports.getMaxAreaOfUpscaleOnce = function() {
    return Prefs[prefMaxAreaUpscaleOnce];
}

exports.areNotificationsEnabled = function() {
    return !Prefs[prefNotificationsDisabled];
}
