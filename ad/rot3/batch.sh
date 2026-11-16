set -e
cd /home/claude/wealth-reels/ad
r() { WC_CODE=bde1fac9 python3 screens_var.py "$@" 2>&1 | grep -E "^ok|Error|Traceback" ; }
r en s1 "Why pay for trading groups when you can get the same for free?" "Why *pay* when it's free?" chill 7101 rot3/en_s1.mp4
r en s2 "Trade ideas only after the trade? With us they come before." "Only *after* the trade? Not here." lofi 7202 rot3/en_s2.mp4
r en s3 "This is what an honest gold group looks like, with real screenshots." "An *honest* gold group" drive 7303 rot3/en_s3.mp4
r en s4 "Looking for a gold group without a subscription and empty promises?" "Gold group, *no subscription*?" chill 7404 rot3/en_s4.mp4
echo ALLDONE
