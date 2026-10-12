#!/bin/bash
# 并行下载聚合带宽测试 v2：按实际字节数统计 + 校验 HTTP 状态码
N=$1; SIZE=${2:-50000000}; URL=${3:-https://speed.cloudflare.com/__down?bytes=$SIZE}
rm -f /tmp/nd_*.out
S=$(date +%s%N)
for i in $(seq 1 $N); do
  curl -s -o /dev/null -w '%{size_download} %{time_total} %{http_code}' --max-time 120 "$URL" > /tmp/nd_$i.out 2>/dev/null &
done
wait
E=$(date +%s%N)
awk -v n="$N" -v s="$S" -v e="$E" -v sz="$SIZE" '
BEGIN{ wall=(e-s)/1e9; total=0; ok=0; codes="";
  while((getline line < "/tmp/nd_tot")>0){} close("/tmp/nd_tot"); }
' /dev/null
# 统计实际字节
TOT=0; OK=0; BAD=""
for f in /tmp/nd_*.out; do
  [ -e "$f" ] || continue
  read -r BYTES TT CODE < "$f"
  TOT=$((TOT + BYTES))
  if [ "$CODE" = "200" ] || [ "$CODE" = "206" ]; then OK=$((OK+1)); else BAD="$BAD $CODE"; fi
done
awk -v n="$N" -v s="$S" -v e="$E" -v tot="$TOT" -v ok="$OK" -v bad="$BAD" 'BEGIN{
  wall=(e-s)/1e9;
  printf "streams=%2d  ok=%d/%d%s  bytes=%7.1fMB  wall=%6.3fs  ==> %7.2f MB/s = %7.1f Mbps\n",
    n, ok, n, (bad=="" ? "" : "  ERR:"bad), tot/1e6, wall, tot/wall/1e6, tot*8/wall/1e6 }'
