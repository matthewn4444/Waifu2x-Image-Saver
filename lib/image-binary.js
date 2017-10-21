const {Cu, Ci, Cc} = require("chrome");
const {atob, btoa} = require("resource://gre/modules/Services.jsm");
const utils = require("./utils");
Cu.import("resource://gre/modules/osfile.jsm");

const PNG_Header = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const JPG_Header = Uint8Array.of(0xFF, 0xD8);
const GIF_Header = Uint8Array.of(47, 49, 46, 38, 39, 61);
const BMP_Header = Uint8Array.of(0x4D, 0x42);
const WEBP_Header = Uint8Array.of(82 /*R*/, 73 /*I*/, 70 /*F*/, 70 /*F*/);
const BASE64_MARKER = ';base64,';

function ImageBinary(data, transparency) {
    this.__isDataUrl = typeof data === "string" && data.startsWith("data:image/");
    this.__data = data;

    this.transparency = transparency;
    this.length = this.__getLength();
}

ImageBinary.prototype.toDataURL = function() {
    return this.__binaryToDataUrl();
}

ImageBinary.prototype.toBinary = function() {
    return this.__dataUrlToBinary();
}

ImageBinary.prototype.save = function(path, callback) {
    OS.File.writeAtomic(path, this.toBinary()).then(
        function() {
            callback();
        }, function(e) {
            callback(e);
        }
    );
}

ImageBinary.prototype.isTransparencyCalculated = function() {
    return this.transparency != utils.TRANSPARENCY_NOT_CALCULATED;
}

ImageBinary.prototype.isTransparent = function() {
    return this.transparency == utils.TRANSPARENT;
}

ImageBinary.prototype.__dataUrlToBinary = function() {
    if (!this.__isDataUrl) return this.__data;
    var base64Index = this.__data.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
    var base64 = this.__data.substring(base64Index);
    var str = atob(base64);
    var bufView = new Uint8Array(new ArrayBuffer(str.length));
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return bufView;
}

ImageBinary.prototype.__binaryToDataUrl = function() {
    if (this.__isDataUrl) return this.__data;

    // Detect the type of image
    var imageType = null;
    if (this.__headerStartsWith(JPG_Header)) {
        imageType = "jpeg";
    } else if (this.__headerStartsWith(PNG_Header)) {
        imageType = "png";
    } else if (this.__headerStartsWith(GIF_Header)) {
        imageType = "gif";
    } else if (this.__headerStartsWith(BMP_Header)) {
        imageType = "bmp";
    } else if (this.__headerStartsWith(WEBP_Header)) {
        imageType = "webp";
    } else {
        throw new Error("Implement image type, unknown header!!");
    }

    // Convert to base64
    var CHUNK_SZ = 0x8000;
    var c = [];
    for (var i=0; i < this.__data.length; i+=CHUNK_SZ) {
        c.push(String.fromCharCode.apply(null, this.__data.subarray(i, i+CHUNK_SZ)));
    }
    return "data:image/" + imageType + BASE64_MARKER + btoa(c.join(""));
}

ImageBinary.prototype.__headerStartsWith = function(arr) {
    if (arr.length > this.__data.length) {
        return false;
    }
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] != this.__data[i]) {
            return false;
        }
    }
    return true;
}

ImageBinary.prototype.__getLength = function() {
    if (this.__isDataUrl) {
        var index = this.__data.indexOf(BASE64_MARKER);
        if (index == -1) {
            throw new Error("Cannot get size of dataURL because it does not have the correct header");
        }
        index += BASE64_MARKER.length;
        return Math.round((this.__data.length - index) * 3 / 4);
    } else {
        return this.__data.length;
    }
}

ImageBinary.open = function(filename, callback) {
    OS.File.read(filename).then(
        function onSuccess(array) {
            callback(new ImageBinary(array, utils.TRANSPARENCY_NOT_CALCULATED));
        }
    );
}

exports.ImageBinary = ImageBinary;
