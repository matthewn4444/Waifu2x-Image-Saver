const QUALITY = 95;
const {Cu, Ci, Cc} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");

const data = require("sdk/self").data;
const wu = require("sdk/window/utils");
const privateBrowsing = require("sdk/private-browsing")
const child_process = require("sdk/system/child_process");
const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
const jpge = Services.io.newURI(data.url("native/jpge.exe"),null,null).QueryInterface(Ci.nsIFileURL).file.path;

exports.openSaveAsDialogForImages = function(title, path, callback) {
    var start = path.lastIndexOf("/") + 1;
    var end = path.indexOf("?", start);
    var filename = end == -1 ? path.substring(start) : path.substring(start, end);

    // Resolve the extension TODO make this smarter
    end = filename.lastIndexOf(".");
    var ext = end != -1 ? filename.substring(end + 1) : "jpg";      // Default to jpg
    if (ext != "jpg" && ext != "png" && ext != "bmp" && ext != "jpeg") {
        ext = "jpg";
    }

    // Resolve the name of the file
    var name = end != -1 ? filename.substring(0, end) : filename;

    // Open the save dialog
    fp.init(wu.getMostRecentBrowserWindow(), title, Ci.nsIFilePicker.modeSave);
    fp.defaultString = name + "." + ext;
    fp.appendFilter("(*.jpg;*.jpg)", "*.jpg;*.jpg");
    var res = fp.show();
    if (res != Ci.nsIFilePicker.returnCancel) {
        // Replace the extension with jpg
        var newPath = fp.file.path.substring(0, fp.file.path.lastIndexOf(".") + 1) + "jpg";
        callback(newPath, name, ext);
    }
}

exports.compressImage = function(src, dst, callback) {
    var jpgeProcess = child_process.spawn(jpge, [src, dst, QUALITY]);
    jpgeProcess.on("close", callback);
}

exports.isPrivateBrowsing = function() {
    return privateBrowsing.isPrivate(wu.getMostRecentBrowserWindow());
}
