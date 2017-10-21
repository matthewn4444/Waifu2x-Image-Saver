const {Cu, Ci, Cc} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/osfile.jsm");

const {XMLHttpRequest} = require("sdk/net/xhr");
const {getMostRecentBrowserWindow} = require("sdk/window/utils");
const wu = require("sdk/window/utils");
const privateBrowsing = require("sdk/private-browsing")
const FormData = Cc["@mozilla.org/files/formdata;1"];
const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
const notifications = require("sdk/notifications");
const self = require("sdk/self");
const tabs = require("sdk/tabs");

String.prototype.presentableTitle = function() {
    return this.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}
const Name = self.name.replace(/-/g, " ").presentableTitle();

exports.TRANSPARENCY_NOT_CALCULATED = 0;
exports.TRANSPARENT = 1;
exports.NOT_TRANSPARENT = 2;

/**
 *  Send a GET or POST request. Post will send form data.
 *  Please call unload function in the callback when finished to recycle
 */
exports.request = function(url, action, opts, callback, onerror, onabort) {
    try {
        var xhr = new XMLHttpRequest();
        var fd = null;
        xhr.mozBackgroundRequest = true;

        xhr.open(action, url, true);
        if (opts) {
            var browser = getMostRecentBrowserWindow();
            fd = FormData.createInstance(Ci.nsIDOMFormData);
            for (var key in opts) {
                if (opts.hasOwnProperty(key)) {
                    if (key == "responseType") {
                        xhr.responseType = opts[key];
                    } else {
                        fd.append(key, opts[key]);
                    }
                }
            }
        }
        xhr.onload = function() {
            if (xhr.response != null) {
                if (xhr.status == 200 || xhr.status == 304) {
                    callback(xhr.response, xhr.status);
                } else {
                    onerror(new Error(xhr.response), xhr.status);
                }
            } else {
                onerror(new Error("No data was sent back from this request."));
            }
        }

        xhr.onabort = function() {
            onabort("aborted");
        }
        xhr.onerror = onerror;
        if (fd) {
            xhr.send(fd);
        } else {
            xhr.send();
        }
    } catch(e) {
        onerror(e);
    }
    return xhr;
}

exports.getFileSize = function(path, callback) {
    OS.File.stat(path).then(function onSuccess(info) {
        callback(info ? info.size : 0);
    });
}

exports.openSaveAsDialogForImages = function(opts) {
    const title = opts.title | "Save Image As...";
    const path = opts.path;
    const callback = opts.onSelect;
    const forceExtension = opts.extension;

    var start = path.lastIndexOf("/") + 1;
    var end = path.indexOf("?", start);
    var filename = end == -1 ? path.substring(start) : path.substring(start, end);

    // Resolve the extension
    end = filename.lastIndexOf(".");
    if (forceExtension) {
        ext = forceExtension;
    } else {
        var ext = end != -1 ? filename.substring(end + 1) : "jpg";      // Default to jpg
        if (ext != "jpg" && ext != "png" && ext != "bmp" && ext != "jpeg") {
            ext = "jpg";
        }
    }

    // Resolve the name of the file
    var name = end != -1 ? filename.substring(0, end) : filename;
    console.log("   name", name);

    // Open the save dialog
    fp.init(wu.getMostRecentBrowserWindow(), title, Ci.nsIFilePicker.modeSave);
    fp.defaultString = name + "." + ext;
    fp.appendFilter("(*." + ext + ";*." + ext +")", "*." + ext + ";*." + ext);
    var res = fp.open(function(res) {
        if (res != Ci.nsIFilePicker.returnCancel) {
            // Replace the extension with jpg
            var newPath = fp.file.path;
            if (newPath.endsWith(".jpg") || newPath.endsWith(".jpeg") || newPath.endsWith(".png")
                    || newPath.endsWith(".bmp") || newPath.endsWith(".gif")) {
                newPath = newPath.substring(0, newPath.lastIndexOf("."));
            }
            newPath = newPath + "." + ext;
            callback(null, newPath, name, ext);
        } else {
            callback(true);
        }
    });
}

exports.isPrivateBrowsing = function() {
    return privateBrowsing.isPrivate(wu.getMostRecentBrowserWindow());
}

exports.notify = function(text, imageUrl, url) {
    let opt = {
        title: Name,
        text: text
    };
    if (imageUrl) {
        opt.iconURL = imageUrl;
    }
    if (url) {
        opt.data = url;
        opt.onClick = tabs.open;
    }
    notifications.notify(opt);
}