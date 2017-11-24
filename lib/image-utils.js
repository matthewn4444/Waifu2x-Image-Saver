const Cu = require("chrome").Cu;
const self = require("sdk/self");
const data = self.data;
const tabs = require("sdk/tabs");
const utils = require("./utils");
Cu.import("resource://gre/modules/Task.jsm");
const { clearTimeout, setTimeout } = require("sdk/timers");
const { ImageBinary } = require("./image-binary");

function ensureCalled(name, opt, retryCount, tab, callback) {
    console.log("  nope Called proxy", name, retryCount);
    let timeout = null;
    let worker = (tab ? tab : tabs.activeTab).attach({
        contentScriptFile: [
            data.url("pica.js"),
            data.url("image-utils.js")
        ]
    });
    worker.port.emit(name, opt);
    worker.port.on(name, function(res) {
        worker.destroy();
        worker = null;
        if (timeout) {
            console.log("   Destroy timeout nope");
            clearTimeout(timeout);
            timeout = null;
        }
        if (!callback) {
            console.log("   nope ignore now, callbnack is null");
            return;
        }
        // Call callback
        callback(res, opt);
    });

    // Retry if takes too long (maybe never sent message)
    timeout = setTimeout(function() {
        if (worker) {
            worker.destroy();
            worker = null;
            if (retryCount > 5) {
                console.log("   nope give up");
                callback("  nope Retried to " + name + " a couple times and failed, cannot do it, try again");
                callback = null;
            } else {
                console.log("   nope Did not come back to run again");
                ensureCalled(name, opt, retryCount + 1, tab, callback);
            }
        } else {
            console.log("   nope cannot find worker?");
        }
    }, 4000);
}

function execute(doResize, imageData, width, height, sizeLimit, callback, maxSide) {
    if (!imageData.isTransparencyCalculated()) {
        return callback(new Error("Calling resize/compress without calculcating transparency!"));
    }
    let opt = {
        sizeLimit: sizeLimit,
        data: imageData.toDataURL(),
        isTransparent: imageData.isTransparent()
    };
    if (doResize) {
        opt.width = width;
        opt.height = height;
    } else {
        opt.maxSide = maxSide;
    }

    ensureCalled("resize", opt, 0, null, function(res, options) {
        if (res.error) {
            callback(res.error);
        } else {
            console.log("Execute after", options.isTransparent)
            callback(null, res.data ? new ImageBinary(res.data, options.isTransparent) : null,
                    res.width, res.height);
        }
    });
}

exports.checkTransparency = function(imageFile, callback) {
    if (!imageFile.includes(".png")) {
        // If not png do not calculate
        return callback(null, utils.NOT_TRANSPARENT);
    }
    ImageBinary.open(imageFile, function(imageData) {
        ensureCalled("transparency", imageData.toDataURL(), 0, null, function(res) {
            if (res && res.error) {
                callback(res.error);
            } else {
                callback(null, res.data ? utils.TRANSPARENT : utils.NOT_TRANSPARENT);
            }
        });
    });
}

exports.downloadImageFromTab = function(tab, url, sizeLimit, callback) {
    try {
        let opt = {
            src: url,
            sizeLimit: sizeLimit
        };
        // TODO need a Task.spawn like before?
        ensureCalled("getImage", opt, 0, tab, function(res) {
            if (res.error) {
                return callback(res.error);
            }
            callback(null, new ImageBinary(res.data),
                    res.transparency ? utils.TRANSPARENT : utils.NOT_TRANSPARENT);
        });
    } catch (e if e instanceof TypeError) {
        callback("Cannot download image because tab was closed too fast");
    } catch (e) {
        callback(e);
    }
}

exports.addAlphaChannelToJpg = function(tab, imageData, alphaChannel, callback) {
    if (!imageData.isTransparencyCalculated()) {
        return callback(new Error("Trying to add alpha channel before calculating transparency"));
    }
    if (!imageData.isTransparent()) {
        return callback(new Error("Trying to add alpha channel when not transparent, please fix."));
    }
    let start = Date.now();
    let opt = {
        data: imageData.toDataURL(),
        channel: alphaChannel.toDataURL(),
        start: start
    };
    ensureCalled("addAlphaChannel", opt, 0, tab, function(res, options) {
       if (res.error) {
            return callback(res.error);
        }
        console.log("       add alpha channel ok", Date.now() - options.start,  "ms elpased")
        callback(null, new ImageBinary(res.data, utils.TRANSPARENT));
    });
}


exports.resize = function(imageBinary, width, height, sizeLimit, callback) {
    execute(true, imageBinary, width, height, sizeLimit, callback);
}

exports.compress = function(imageBinary, sizeLimit, maxSide, callback) {
    execute(false, imageBinary, 0, 0, sizeLimit, callback, maxSide);
}
