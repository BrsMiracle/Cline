#!/bin/bash
# 测传输期间消耗的 CPU：判断网络天花板是否被 4 核配额卡住
N=$1; SIZE=${2:-100000000}; URL=${3:-http://cachefly.cachefly.net/100mb.test}
read U0 T0 <<< "$(awk '/^usage_usec/{u=$2} /^throttled_usec/{t=$2} END{print u,t}' /sys/fs/cgroup/cpu.stat)"
S=$(date +%s%N)
rm -f /tmp/nc_*.out
for i in $(seq 1 $N); do curl -s -o /dev/null -w '%{size_download} %{http_code}' --max-time 120 "$URL" > /tmp/nc_$i.out 2>/dev/null & done
wait
E=$(date +%s%N)
read U1 T1 <<< "$(awk '/^usage_usec/{u=$2} /^throttled_usec/{t=$2} END{print u,t}' /sys/fs/cgroup/cpu.stat)"
TOT=0; for f in /tmp/nc_*.out; do [ -e "$f" ] || continue; read -r B C < "$f"; TOT=$((TOT+B)); done
awk -v n="$N" -v u0="$U0" -v u1="$U1" -v t0="$T0" -v t1="$T1" -v s="$S" -v e="$E" -v tot="$TOT" 'BEGIN{
  wall=(e-s)/1e9; cpu=(u1-u0)/1e6; th=(t1-t0)/1e6;
  printf "streams=%-3d 吞吐=%7.2f MB/s (%6.1f Mbps)  wall=%.2fs | 消耗CPU=%.3fs => 平均占用 %.2f 核 | 节流 +%.3fs\n",
    n, tot/wall/1e6, tot*8/wall/1e6, wall, cpu, cpu/wall, th }'
