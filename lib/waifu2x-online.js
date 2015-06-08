var {Cc, Ci, Cu} = require("chrome");
Cu.import("resource://gre/modules/osfile.jsm");

ArrayBuffer.prototype.toString = function() {
    var arr = new Uint8Array(this);
    var text= "";
    for (let i = 0; i < arr.length; i++) {
         text += String.fromCharCode(arr[i]);
    }
    return text;
}

exports.upscaleAndSave = function(imgSrc, savePath, callback) {
    var request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Ci.nsIJSXMLHttpRequest);
    request.mozBackgroundRequest = true;
    request.open("POST", 'http://waifu2x.udp.jp/api', true);
    request.responseType = "arraybuffer";
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    
    request.onload = function() {
        if (request.response != null) {
            if (request.status == 200) {
                var promised = OS.File.writeAtomic(savePath, new Uint8Array(request.response));
                promised.then(
                    function() {
                        // Success
                        callback();
                        onUnload.unload();
                    },
                    function(ex) {
                        callback(ex);
                        onUnload.unload();
                    }
                );
            } else {
                callback(new Error(request.response.toString()));
                onUnload.unload();
            }
        } else {
            onUnload.unload();
            callback(new Error("No data was sent back from this request."));
        }
    }
    request.onerror = function(e) {
        onUnload.unload();
        callback(e);
    }
    // Send the request
    request.send("scale=2&noise=2&url=" + encodeURIComponent(imgSrc));
    
    // Avoid memory leaks and abort after finished
    var onUnload = {
        unload: function() {
            try {
                request.abort();
            } catch (e) {}
        }
    };
    require("sdk/system/unload").ensure(onUnload);
}
