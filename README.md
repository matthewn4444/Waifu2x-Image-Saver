# Waifu2x Image Saver

## Description

You can use this Firefox plugin (Windows and Linux only) to download any image
using the context menu and it will use (online) Waifu2x to upscale the
image and then compress it to jpg to your computer.

![Example](https://i.imgur.com/9kudkd2.jpg)

## Installation

Go to the [releases](https://github.com/matthewn4444/Waifu2x-Image-Saver/releases),
select the newest version and download the xpi file. Upon download you should be
prompt to install the extension.

Alternatively, you can build the project (more details in the next section), compile
the xpi using cfx and drag the file to Firefox to install it.

## Usage

Right-click any image and select **"Save Image with Waifu2x"**. This will prompt
a save window; select location to save image. It will save a *jpg* because the image
will hold less space on your harddrive (no quality was lost). It may take some
time for the process to end (there is no progress bar). It will download the image
to your temporary folder and upload the image multiple times until the image is
very large (larger than 2000x2000 area of pixels).

Any images under the area of 640x640 pixels will only upscale once using Waifu2x
to preserve image quality.

You can control how this addon uploads and using Waifu2x in the settings from the
Addons page.

## Build
1. Setup the [Firefox SDK environment](https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Installation)
2. Clone this project `git clone https://github.com/matthewn4444/Waifu2x-Image-Saver.git`
3. Compile the binary for Windows
  * Open */native/ImageUtils/ImageUtils.sln* for Visual Studio 2013
  * Set to *release* and build the project
4. Compile the binary for Linux
  * Go to */native/ImageUtils/ImageUtils* and run `build.sh`
5. Back at root run the `compile.sh` file or `cfx xpi`

## Thanks

Thanks to the people who created [Waifu2x](https://github.com/nagadomi/waifu2x),
[imageresampler](https://code.google.com/p/imageresampler/) and
[jpeg-compressor](https://code.google.com/p/jpeg-compressor/) for helping me
make this extension.