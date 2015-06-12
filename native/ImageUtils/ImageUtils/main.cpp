#include "utils.h"

DllExport int compressImage(char* srcName, char* dstName, int quality)
{
    int width, height, channels;
    jpge::params params;
    byte* src = loadImage(srcName, quality, &width, &height, &channels, &params);
    if (!src) {
        return 1;
    }

    // Save image
    if (!jpge::compress_image_to_jpeg_file(dstName, width, height, channels, src, params))
    {
        free(src);
        return 2;
    }
    free(src);
    return 0;
}

DllExport int resizeImage(char* srcName, char* dstName, int quality, int toWidth, int toHeight)
{
    int width, height, channels;
    jpge::params params;
    byte* src = loadImage(srcName, quality, &width, &height, &channels, &params);
    if (!src) {
        return 1;
    }

    // Resize
    byte* output = new byte[toWidth * toHeight * channels];
    if (!resize(src, width, height, output, toWidth, toHeight, channels)) {
        return 3;
    }

    // Save image
    if (!jpge::compress_image_to_jpeg_file(dstName, toWidth, toHeight, channels, output, params))
    {
        delete[] output;
        free(src);
        return 2;
    }
    delete[] output;
    free(src);
    return 0;
}
