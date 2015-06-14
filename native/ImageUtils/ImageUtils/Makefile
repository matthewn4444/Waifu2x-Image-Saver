OUTPUT = ../../../data/native/
CXXFLAGS += -fPIC
CXXFLAGS += -O3
ImageUtils.so: jpge.o jpgd.o resampler.o main.o
	g++ -shared $^ -o $(OUTPUT)$@
clean:
	@rm -f $(PROGRAMS) *.o $(OUTPUT)*.so code
