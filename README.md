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
the xpi using jpm and drag the file to Firefox to install it.

```jpm xpi```

## Usage

Right-click any image and select **"Save Image with Waifu2x"**. This will prompt
a save window; select location to save image. It will save the image with double
the height and width with the original file type. It may take some time for the
process to end (there is no progress bar). It will download the image to your
temporary folder and upload the image multiple times until the image is very
large (larger than 2560x2560 area of pixels).

Any images under the area of 1280x720 pixels will only upscale once using Waifu2x
to preserve image quality. Images with transparency will also work!

You can control how this addon uploads and using Waifu2x in the settings from the
Addons page.

The source engine this uses is [https://waifu2x.booru.pics/](https://waifu2x.booru.pics/).

## Build
1. Clone this project `git clone https://github.com/matthewn4444/Waifu2x-Image-Saver.git`
2. Back at root run the `compile.sh` file or `jpm xpi`

## Thanks

Thanks to the people who created [Waifu2x](https://waifu2x.booru.pics/)
and [pica](https://github.com/nodeca/pica)
make this extension.