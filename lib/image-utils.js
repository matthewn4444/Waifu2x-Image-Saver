const Cu = require("chrome").Cu;
const self = require("sdk/self");
const data = self.data;
const tabs = require("sdk/tabs");
const utils = require("./utils");
Cu.import("resource://gre/modules/Task.jsm");
const { ImageBinary } = require("./image-binary");

function execute(doResize, imageData, width, height, sizeLimit, callback, maxSide) {
    console.log("Execute", imageData.isTransparent(), imageData.isTransparencyCalculated())
    if (!imageData.isTransparencyCalculated()) {
        return callback(new Error("Calling resize/compress without calculcating transparency!"));
    }

    let worker = tabs.activeTab.attach({
        contentScriptFile: [
            data.url("pica.js"),
            data.url("image-utils.js")
        ]
    });
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
    worker.port.emit("resize", opt);
    worker.port.on("resize", function(res) {
        if (res.error) {
            callback(res.error);
        } else {
            console.log("Execute after", imageData.isTransparent(), imageData.isTransparencyCalculated())
            callback(null, res.data ? new ImageBinary(res.data, imageData.isTransparent()) : null,
                    res.width, res.height);
        }
    });
}

exports.checkTransparency = function(imageFile, callback) {
    if (!imageFile.includes(".png")) {
        // If not png do not calculate
        return callback(null, utils.NOT_TRANSPARENT);
    }
    let worker = tabs.activeTab.attach({
        contentScriptFile: data.url("image-utils.js"),
    });
    ImageBinary.open(imageFile, function(imageData) {
        worker.port.emit("transparency", imageData.toDataURL());
    });
    worker.port.on("transparency", function(res) {
        if (res && res.error) {
            callback(res.error);
        } else {
            callback(null, res.data ? utils.TRANSPARENT : utils.NOT_TRANSPARENT);
        }
    });
}

exports.downloadImageFromTab = function(tab, url, sizeLimit, callback) {
    try {
        let worker = tab.attach({
            contentScriptFile: data.url("image-utils.js")
        });
        worker.port.on("getImage", function(res) {
            if (res.error) {
                return callback(res.error);
            }
            callback(null, new ImageBinary(res.data),
                    res.transparency ? utils.TRANSPARENT : utils.NOT_TRANSPARENT);
        });
        Task.spawn(function() {
            worker.port.emit("getImage", {
                src: url,
                sizeLimit: sizeLimit
            });
        });
    } catch (e if e instanceof TypeError) {
        callback("Cannot download image because tab was closed too fast");
    } catch (e) {
        callback(e);
    }
}

exports.addAlphaChannelToJpg = function(tab, imageData, alphaChannel, callback) {
    if (imageData.isTransparent()) {
        return callback(new Error("Trying to add alpha channel before calculating transparency"));
    }
    let worker = tab.attach({
        contentScriptFile: [
            data.url("pica.js"),
            data.url("image-utils.js")
        ],
    });
    let start = Date.now();
    worker.port.on("addAlphaChannel", function(res) {
        if (res.error) {
            return callback(res.error);
        }
        console.log("       add alpha channel ok", Date.now() - start,  "ms elpased")
        callback(null, new ImageBinary(res.data, utils.TRANSPARENT));
    });
    Task.spawn(function() {
        worker.port.emit("addAlphaChannel", {
            data: imageData.toDataURL(),
            channel: alphaChannel.toDataURL()
        });
    });
}


// TODO what is isJpeg? Redefine use case
exports.resize = function(imageBinary, width, height, sizeLimit, callback) {
    execute(true, imageBinary, width, height, sizeLimit, callback);
}

exports.compress = function(imageBinary, sizeLimit, maxSide, callback) {
    execute(false, imageBinary, 0, 0, sizeLimit, callback, maxSide);
}
