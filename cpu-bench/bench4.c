// bench4: rigorous fixed-iteration microbenchmarks (timing only outside the loop)
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <time.h>
#include <immintrin.h>

static double now(void){ struct timespec ts; clock_gettime(CLOCK_MONOTONIC,&ts); return ts.tv_sec+ts.tv_nsec*1e-9; }
static inline unsigned long long rdtsc(void){ unsigned lo,hi; __asm__ __volatile__("rdtsc":"=a"(lo),"=d"(hi)); return ((unsigned long long)hi<<32)|lo; }
#define BX(v) __asm__ __volatile__("" : "+x"(v))
#define BG(v) __asm__ __volatile__("" : "+r"(v))

// ---- mode 0: dependent imul chain, 1 imul per step (Ze4 latency=3c) ----
static double chain_int(long iters, unsigned long long coef){
    unsigned long long x = 0x123456789abcdefULL;
    for(long i=0;i<iters;i++){
        x = x*coef; BG(x);
        x = x*coef; BG(x);
        x = x*coef; BG(x);
        x = x*coef; BG(x);
    }
    if(x==1) printf(" ");
    return (double)iters*4;             // imuls
}
// ---- mode 1: dependent FMA chain, 1 FMA per step (Zen4 latency=4c) ----
static double chain_fma(long iters, double coef){
    __m256d a=_mm256_set1_pd(coef), b=_mm256_set1_pd(1e-9), acc=_mm256_set1_pd(.5);
    for(long i=0;i<iters;i++){
        acc=_mm256_fmadd_pd(a,acc,b); BX(acc);
        acc=_mm256_fmadd_pd(a,acc,b); BX(acc);
        acc=_mm256_fmadd_pd(a,acc,b); BX(acc);
        acc=_mm256_fmadd_pd(a,acc,b); BX(acc);
    }
    if(_mm256_cvtsd_f64(acc)==1e300) printf(" ");
    return (double)iters*4;             // FMAs
}
// ---- mode 2: 8 independent FMA chains -> peak DP throughput ----
static double peak_fma(long iters, double coef){
    __m256d a=_mm256_set1_pd(coef), b=_mm256_set1_pd(1e-9);
    __m256d c0=_mm256_set1_pd(.1),c1=_mm256_set1_pd(.2),c2=_mm256_set1_pd(.3),c3=_mm256_set1_pd(.4);
    __m256d c4=_mm256_set1_pd(.5),c5=_mm256_set1_pd(.6),c6=_mm256_set1_pd(.7),c7=_mm256_set1_pd(.8);
    for(long i=0;i<iters;i++){
        c0=_mm256_fmadd_pd(a,c0,b); c1=_mm256_fmadd_pd(a,c1,b);
        c2=_mm256_fmadd_pd(a,c2,b); c3=_mm256_fmadd_pd(a,c3,b);
        c4=_mm256_fmadd_pd(a,c4,b); c5=_mm256_fmadd_pd(a,c5,b);
        c6=_mm256_fmadd_pd(a,c6,b); c7=_mm256_fmadd_pd(a,c7,b);
    }
    BX(c0);BX(c1);BX(c2);BX(c3);BX(c4);BX(c5);BX(c6);BX(c7);
    __m256d s=_mm256_add_pd(_mm256_add_pd(_mm256_add_pd(c0,c1),_mm256_add_pd(c2,c3)),
                            _mm256_add_pd(_mm256_add_pd(c4,c5),_mm256_add_pd(c6,c7)));
    if(_mm256_cvtsd_f64(s)==1e300) printf(" ");
    return (double)iters*8;             // FMAs
}

typedef struct { int mode, id; long iters; double coef; unsigned long long cyc; double sec; } arg_t;
static void *worker(void *p){
    arg_t*a=(arg_t*)p;
    unsigned long long t0=rdtsc(); double w0=now();
    double ops;
    switch(a->mode){
        case 0: ops=chain_int(a->iters,(unsigned long long)(a->coef*1e6)|1ULL); break;
        case 1: ops=chain_fma(a->iters,a->coef); break;
        default: ops=peak_fma(a->iters,a->coef); break;
    }
    double w1=now(); unsigned long long t1=rdtsc();
    a->cyc=(t1-t0); a->sec=(w1-w0);
    a->iters=(long)ops;
    return NULL;
}
int main(int argc,char**argv){
    int mode=argc>1?atoi(argv[1]):2;
    int n=argc>2?atoi(argv[2]):1;
    long iters=argc>3?atol(argv[3]):100000000L;
    double coef=argc>4?atof(argv[4]):1.0000001;
    pthread_t th[512]; static arg_t ar[512];
    for(int i=0;i<n;i++){ ar[i]=(arg_t){mode,i,iters,coef+i*1e-12,0,0}; pthread_create(&th[i],NULL,worker,&ar[i]); }
    double tot_ops=0, tot_sec=0; unsigned long long maxcyc=0;
    for(int i=0;i<n;i++){ pthread_join(th[i],NULL); tot_ops+=ar[i].iters; tot_sec+=ar[i].sec; if(ar[i].cyc>maxcyc)maxcyc=ar[i].cyc; }
    double agg_rate = tot_ops/tot_sec;              // ops per cpu-second
    double tsc_ghz = (double)maxcyc/ (tot_sec/n) /1e9; // rough tsc freq if no throttling
    printf("mode=%d  threads=%3d  ops/thread=%.0fM  per-thread=%.3f Gop/s  AGG=%.2f Gop/s  eff_cores=%.2f\n",
           mode,n,iters/1e6,(tot_ops/n)/tot_sec/1e9,agg_rate/1e9, agg_rate/ ((tot_ops/n)/tot_sec) );
    return 0;
}
