# Waifu2x Image Saver

## Description

You can use this Firefox plugin to download any image
using the context menu and it will use (online) Waifu2xBooru to upscale the
image and then compress it to jpg or png to your computer.

This extension is a web extension built for Firefox 45+. It is different than the older versions.

![Example](https://i.imgur.com/9kudkd2.jpg)

## Installation

Go to the [releases](https://github.com/matthewn4444/Waifu2x-Image-Saver/releases),
select the newest version and download the xpi file. Upon download you should be
prompt to install the extension.

Using the current version has no xpi file yet because it is still early but can be used on newer
versions of Firefox. Download the source and go to *about:debugging* and choose the manifest.json
file to load the extension into the browser. This is technically for debugging so you have to
re-add it every time you close your browser. This is work in progress until I actually submit it
in the future.

## Usage

1. Right-click any image and select **"Save Image with Waifu2x"**.
2. It will queue (later a manager will be written with a panel in toolbar)
3. When it is ready, a notification will appear and save as dialog will come up
4. Save image and if you click the notification it will move on to the next download

Images on Waifu2xBoou can only save images max of 3840 x 3840 or 5mb.

Current version will save all images as jpeg (choice later).

Any images under the area of 1280x720 pixels will only upscale once using Waifu2x to preserve
image quality. There are only max 2 upscales per image. Images with transparency will also work!

The source engine this uses is [https://waifu2x.booru.pics/](https://waifu2x.booru.pics/).

## Build
1. Clone this project `git clone https://github.com/matthewn4444/Waifu2x-Image-Saver.git`
2. Coming soon!

## future
* Save queued images into storage to avoid leaving in memory
* Add a download manager to download again or keep track of what is downloaded
* Maybe add a popup preview of the image currently downloading
* Submit into the Mozilla extensions site
* Panel to easily check progress
* Add progress to downloads
* Being able to cancel downlods

## Thanks

Thanks to the people who created [Waifu2x](https://waifu2x.booru.pics/)
and [pica](https://github.com/nodeca/pica)
and [FileSaver.js](https://github.com/eligrey/FileSaver.js/)
make this extension.