#!/bin/bash
N=$1; ITERS=${2:-1000000000}
read U0 T0 <<< "$(awk '/^usage_usec/{u=$2} /^throttled_usec/{t=$2} END{print u,t}' /sys/fs/cgroup/cpu.stat)"
S=$(date +%s%N)
/tmp/bench4 2 $N $ITERS >/dev/null
E=$(date +%s%N)
read U1 T1 <<< "$(awk '/^usage_usec/{u=$2} /^throttled_usec/{t=$2} END{print u,t}' /sys/fs/cgroup/cpu.stat)"
awk -v n="$N" -v u0="$U0" -v u1="$U1" -v t0="$T0" -v t1="$T1" -v s="$S" -v e="$E" 'BEGIN{wall=(e-s)/1e9; cpu=(u1-u0)/1e6; th=(t1-t0)/1e6; printf "threads=%4d  wall=%7.3fs  cpu_time=%8.3fs  EFFECTIVE_CORES=%5.2f  throttled_delta=%7.3fs\n", n, wall, cpu, cpu/wall, th}'
