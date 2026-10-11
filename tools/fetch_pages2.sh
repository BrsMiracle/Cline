#!/usr/bin/env bash
# Round 2: corrected URLs for pages whose first attempt failed.
set -u
OUT=/tmp/pages
mkdir -p "$OUT"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
fetch() {
  slug="$1"; url="$2"
  code=$(curl -sS --max-time 90 -A "$UA" "https://r.jina.ai/$url" -o "$OUT/$slug.txt" -w '%{http_code}')
  echo "$code $(wc -c < "$OUT/$slug.txt") $slug"
  sleep 2
}
fetch sentosa_luge    "https://sentosa.skylineluge.com/"
fetch luge_tickets    "https://sentosa.skylineluge.com/tickets/"
fetch gbtb_tickets    "https://ticket.gardensbythebay.com.sg/"
fetch sgflyer_home    "https://www.singaporeflyer.com/"
fetch artsscience_tickets "https://www.marinabaysands.com/museum/tickets.html"
fetch mandai_buy      "https://buy.mandai.com/web-storefront/en/multi-attraction-tickets"
fetch mandai_tickets  "https://www.mandai.com/en/tickets-and-passes.html"
fetch rws_uss_tickets "https://www.rwsentosa.com/en/play/universal-studios-singapore/tickets"
fetch ng_admission    "https://www.nationalgallery.sg/sg/en/visit/admission.html"
fetch nm_admission    "https://www.nhb.gov.sg/nationalmuseum/visit/admission-charges"
fetch mandai_night2   "https://www.mandai.com/en/night-safari.html"
fetch changi_mrt      "https://www.changiairport.com/en/transport/mrt.html"
fetch changi_taxi     "https://www.changiairport.com/en/transport/taxi.html"
fetch changi_bus      "https://www.changiairport.com/en/transport/bus.html"
echo DONE2
