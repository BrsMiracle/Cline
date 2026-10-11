#!/usr/bin/env bash
# Fetch travel-guide source pages through the r.jina.ai reader proxy and save
# the plain-text/markdown rendering under /tmp/pages/<slug>.txt.
# Usage: bash tools/fetch_pages.sh
set -u
OUT=/tmp/pages
mkdir -p "$OUT"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
fetch() {
  slug="$1"; url="$2"
  if [ -s "$OUT/$slug.txt" ] && [ "$(wc -c < "$OUT/$slug.txt")" -gt 1500 ]; then
    echo "SKIP $slug"; return
  fi
  code=$(curl -sS --max-time 90 -A "$UA" "https://r.jina.ai/$url" -o "$OUT/$slug.txt" -w '%{http_code}')
  echo "$code $(wc -c < "$OUT/$slug.txt") $slug"
  sleep 2
}
fetch mbs_skypark        "https://www.marinabaysands.com/attractions/skypark-observation-deck.html"
fetch artsscience        "https://www.marinabaysands.com/museum.html"
fetch uss                "https://www.rwsentosa.com/en/play/universal-studios-singapore"
fetch oceanarium         "https://www.rwsentosa.com/en/play/singapore-oceanarium"
fetch skylineluge        "https://www.skylineluge.com/singapore/"
fetch gbtb_admissions    "https://www.gardensbythebay.com.sg/en/admissions.html"
fetch mandai_zoo         "https://www.mandai.com/en/singapore-zoo.html"
fetch mandai_night       "https://www.mandai.com/en/night-safari.html"
fetch mandai_river       "https://www.mandai.com/en/river-wonders.html"
fetch singaporeflyer     "https://www.singaporeflyer.com/en/tickets"
fetch jewel_canopy       "https://www.jewelchangiairport.com/en/attractions/canopy-park.html"
fetch nationalgallery    "https://www.nationalgallery.sg/visit/tickets"
fetch nationalmuseum     "https://www.nhb.gov.sg/nationalmuseum/plan-your-visit/admission-charges"
fetch nparks_sbg         "https://www.nparks.gov.sg/sbg"
fetch nparks_fortcanning "https://www.nparks.gov.sg/visit/parks/park-detail/fort-canning-park"
fetch nparks_southernridges "https://www.nparks.gov.sg/visit/parks/park-detail/southern-ridges"
fetch laupasat           "https://www.laupasat.sg/"
fetch jumbo              "https://www.jumboseafood.com.sg/en/menu"
fetch songfa             "https://songfa.com.sg/"
fetch yakun              "https://www.yakun.com/"
fetch katonglaksa        "https://www.328katonglaksa.com.sg/"
fetch weather_climate    "https://www.weather.gov.sg/climate-climate-of-singapore/"
fetch simplygo           "https://simplygo.com.sg/"
fetch touristpass        "https://thesingaporetouristpass.com.sg/"
fetch sgac               "https://www.ica.gov.sg/enter-transit-depart/entering-singapore/sg-arrival-card"
fetch changi_transport   "https://www.changiairport.com/en/transport/arrival-and-departure/mrt.html"
fetch visitsg_mbs        "https://www.visitsingapore.com/see-do-singapore/recreation-leisure/attractions/marina-bay-sands/"
fetch visitsg_chinatown  "https://www.visitsingapore.com/see-do-singapore/district-guides/chinatown/"
echo DONE
