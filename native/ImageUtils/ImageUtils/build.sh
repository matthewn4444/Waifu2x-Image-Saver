# Script to build both 32bit and 64bit versions

function build
{
    rm -f *.o
    g++ -shared $CXXFLAGS jpge.cpp jpgd.cpp resampler.cpp main.cpp -o $OUTPUT/ImageUtils.so
}

# 32bit
OUTPUT=$PWD/../../../data/native/ 
export CXXFLAGS="-m32 -O3 -fPIC"
build

# 64bit
OUTPUT=$PWD/../../../data/native/x64 
export CXXFLAGS="-m64 -O3 -fPIC"
build