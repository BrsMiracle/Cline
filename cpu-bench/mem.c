#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <time.h>
static double now(){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec*1e-9;}
static char *buf; static size_t N; static int nth;
static void*w(void*p){size_t chunk=N/nth; long off=(long)p; char*b=buf+off*chunk;
  for(size_t i=0;i<chunk;i+=64){ __asm__ __volatile__("vmovdqu %%ymm0,(%0)"::"r"(b+i):"memory"); } return 0;}
int main(int argc,char**argv){nth=argc>1?atoi(argv[1]):1; N=(argc>2?atol(argv[2]):512)*1024UL*1024UL;
  buf=aligned_alloc(64,N); memset(buf,1,N);
  pthread_t t[64]; double t0=now();
  for(int i=0;i<nth;i++) pthread_create(&t[i],0,w,(void*)(long)i);
  for(int i=0;i<nth;i++) pthread_join(t[i],0);
  double d=now()-t0; printf("memset(BW) threads=%d  %6.2f GB/s  (%.3fs)\n",nth,N/d/1e9,d); return 0;}
