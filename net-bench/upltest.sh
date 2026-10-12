#!/bin/bash
N=$1; FILE=$2
rm -f /tmp/nu_*.out
S=$(date +%s%N)
for i in $(seq 1 $N); do
  curl -s -o /dev/null -w '%{size_upload} %{time_total} %{http_code}' --max-time 120 -X POST --data-binary @$FILE https://speed.cloudflare.com/__up > /tmp/nu_$i.out 2>/dev/null &
done
wait
E=$(date +%s%N)
TOT=0; OK=0; BAD=""
for f in /tmp/nu_*.out; do [ -e "$f" ] || continue; read -r B T C < "$f"; TOT=$((TOT+B)); if [ "$C" = "200" ]; then OK=$((OK+1)); else BAD="$BAD $C"; fi; done
awk -v n="$N" -v s="$S" -v e="$E" -v tot="$TOT" -v ok="$OK" -v bad="$BAD" 'BEGIN{wall=(e-s)/1e9; printf "UPLOAD streams=%2d ok=%d/%d%s bytes=%6.1fMB wall=%6.3fs ==> %6.2f MB/s = %6.1f Mbps\n", n, ok, n, (bad==""?"":" ERR:"bad), tot/1e6, wall, tot/wall/1e6, tot*8/wall/1e6}'
