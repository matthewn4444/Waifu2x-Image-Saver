const QUALITY = 95;
const {Cu, Ci} = require("chrome");

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const data = require("sdk/self").data;
const dll = Services.io.newURI(data.url("native/ImageUtils.dll"),null,null)
    .QueryInterface(Ci.nsIFileURL).file.path;

exports.compress = function(src, dst) {
    var ret = 0;
    try {
        var lib = ctypes.open(dll);
        var fn = lib.declare("compressImage", ctypes.default_abi, ctypes.int32_t,
            ctypes.char.ptr, ctypes.char.ptr, ctypes.int32_t);
        ret = fn(ctypes.char.array()(src), ctypes.char.array()(dst), QUALITY);
    } catch(e) {
        console.error(e);
        return 1;
    } finally {
        if (lib) {
            lib.close();
        }
    }
    return ret;
}

exports.resize = function(src, dst, toWidth, toHeight) {
    var ret = 0;
    try {
        var lib = ctypes.open(dll);
        var fn = lib.declare("resizeImage", ctypes.default_abi, ctypes.int32_t,
            ctypes.char.ptr, ctypes.char.ptr,
            ctypes.int32_t, ctypes.int32_t, ctypes.int32_t);
        ret = fn(ctypes.char.array()(src), ctypes.char.array()(dst),
            QUALITY, toWidth, toHeight);
    } catch(e) {
        console.error(e);
        return 1;
    } finally {
        if (lib) {
            lib.close();
        }
    }
    return ret;
}