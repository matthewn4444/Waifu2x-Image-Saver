#ifndef __UTILS_H__
#define __UTILS_H__

#include "jpge.h"
#include "jpgd.h"
#include "stb_image.c"
#include <vector>
#include <algorithm>

#include "resampler.h"

#ifdef _WIN32
#  define DllExport extern "C" __declspec(dllexport)
#else
#  define DllExport extern "C"
#endif

typedef unsigned char byte;

static bool resize(byte* src, int srcW, int srcH, byte* dst, int dstW, int dstH, int channels) {
    static const float source_gamma = 1.75f;

    // Filter scale - values < 1.0 cause aliasing, but create sharper looking mips.
    const float filter_scale = 1.0f;//.75f;

    const char* pFilter = RESAMPLER_DEFAULT_FILTER;

    float srgb_to_linear[256];
    for (int i = 0; i < 256; ++i)
        srgb_to_linear[i] = (float)pow(i * 1.0f / 255.0f, source_gamma);

    const int linear_to_srgb_table_size = 4096;
    unsigned char linear_to_srgb[linear_to_srgb_table_size];

    const float inv_linear_to_srgb_table_size = 1.0f / linear_to_srgb_table_size;
    const float inv_source_gamma = 1.0f / source_gamma;

    for (int i = 0; i < linear_to_srgb_table_size; ++i)
    {
        int k = (int)(255.0f * pow(i * inv_linear_to_srgb_table_size, inv_source_gamma) + .5f);
        if (k < 0) k = 0; else if (k > 255) k = 255;
        linear_to_srgb[i] = (unsigned char)k;
    }

    // Run routine
    Resampler* resamplers[3];
    std::vector<float> samples[3];

    // Now create a Resampler instance for each component to process. The first instance will create new contributor tables, which are shared by the resamplers
    // used for the other components (a memory and slight cache efficiency optimization).
    resamplers[0] = new Resampler(srcW, srcH, dstW, dstH, Resampler::BOUNDARY_CLAMP, 0.0f, 1.0f, pFilter, NULL, NULL, filter_scale, filter_scale);
    samples[0].resize(srcW);
    for (int i = 1; i < channels; i++)
    {
        resamplers[i] = new Resampler(srcW, srcH, dstW, dstH, Resampler::BOUNDARY_CLAMP, 0.0f, 1.0f, pFilter, resamplers[0]->get_clist_x(), resamplers[0]->get_clist_y(), filter_scale, filter_scale);
        samples[i].resize(srcW);
    }

    const int src_pitch = srcW * channels;
    const int dst_pitch = dstW * channels;
    int dst_y = 0;

    for (int src_y = 0; src_y < srcH; src_y++)
    {
        const unsigned char* pSrc = &src[src_y * src_pitch];

        for (int x = 0; x < srcW; x++)
        {
            for (int c = 0; c < channels; c++)
            {
                if ((c == 3) || ((channels == 2) && (c == 1)))
                    samples[c][x] = *pSrc++ * (1.0f / 255.0f);
                else
                    samples[c][x] = srgb_to_linear[*pSrc++];
            }
        }

        for (int c = 0; c < channels; c++)
        {
            if (!resamplers[c]->put_line(&samples[c][0]))
            {
                //printf("Out of memory!\n");
                return false;
            }
        }

        for (;;)
        {
            int comp_index;
            for (comp_index = 0; comp_index < channels; comp_index++)
            {
                const float* pOutput_samples = resamplers[comp_index]->get_line();
                if (!pOutput_samples)
                    break;

                const bool alpha_channel = (comp_index == 3) || ((channels == 2) && (comp_index == 1));
                unsigned char* pDst = &dst[dst_y * dst_pitch + comp_index];

                for (int x = 0; x < dstW; x++)
                {
                    if (alpha_channel)
                    {
                        int c = (int)(255.0f * pOutput_samples[x] + .5f);
                        if (c < 0) c = 0; else if (c > 255) c = 255;
                        *pDst = (unsigned char)c;
                    }
                    else
                    {
                        int j = (int)(linear_to_srgb_table_size * pOutput_samples[x] + .5f);
                        if (j < 0) j = 0; else if (j >= linear_to_srgb_table_size) j = linear_to_srgb_table_size - 1;
                        *pDst = linear_to_srgb[j];
                    }

                    pDst += channels;
                }
            }
            if (comp_index < channels)
                break;

            dst_y++;
        }
    }
    return true;
}

static byte* loadImage(char* filename, int quality, int* width, int* height, int* channels, jpge::params* params) {
    int req_channels = 4;
    byte* src = stbi_load(filename, width, height, channels, 0);
    if (!src) {
        return 0;
    }

    // Fill compression params
    params->m_quality = std::max(std::min(quality, 100), 0);
    params->m_subsampling = (*channels == 1) ? jpge::Y_ONLY : jpge::H2V2;
    params->m_two_pass_flag = false; //optimize_huffman_tables;
    return src;
}

#endif // __UTILS_H__
