#!/bin/bash
cd /home/claude/wealth-reels/ad
export WC_CODE=bde1fac9
for h in 2 3 4 5; do
  out=$(CTA_LINE="" AD_HOOK=$h python3 ad_vorteile.py rot/de_p$h.mp4 2>&1); echo "$out" | tail -2
  t0=$(echo "$out" | grep -o "CTA-Start [0-9.]*" | awk '{print $2}')
  ffmpeg -v error -y -i rot/de_p$h.mp4 -vf "drawtext=fontfile=/usr/share/fonts/opentype/inter/Inter-Bold.otf:text='Fragen? Telegram @KKIUTz':fontsize=38:fontcolor=0xE8B54A:x=(w-text_w)/2:y=1450-ascent:alpha='if(lt(t,$t0+1.8),0,min(1,(t-$t0-1.8)/0.4))'" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a copy -movflags +faststart rot/de_m$h.mp4 && echo "main $h ok"
  AD_HOOK=$h python3 ad_vorteile_pl.py rot/pl_p$h.mp4 2>&1 | tail -1
done
cp wealthclub_ad_vorteile_de.mp4 rot/de_m1.mp4; cp work/vort/partner_base.mp4 rot/de_p1.mp4; cp wealthclub_ad_vorteile_pl.mp4 rot/pl_p1.mp4
ls -la rot/*.mp4; echo BATCH_DONE
