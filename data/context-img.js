self.on("click", function (node, data) {
    if (node.naturalWidth && node.naturalHeight && node.src) {
        self.postMessage({
            src:    node.src,
            width:  node.naturalWidth,
            height: node.naturalHeight,
        });
    } else {
        self.postMessage({
            error: "Cannot save because this is not an image"
        })
    }
});