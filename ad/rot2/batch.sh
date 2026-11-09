set -e
cd /home/claude/wealth-reels/ad
r() { WC_CODE=bde1fac9 python3 screens_var.py "$@" 2>&1 | grep -E "^ok|Error|Traceback" ; }
r de s2 "Trade-Ideen erst nach dem Trade? Bei uns kommen sie vorher." "Erst *nach* dem Trade? Nicht bei uns." lofi 5202 rot2/de_s2.mp4
r de s3 "So sieht eine ehrliche Gold-Gruppe aus – mit echten Screenshots." "So sieht eine *ehrliche* Gold-Gruppe aus" drive 5303 rot2/de_s3.mp4
r de s4 "Du suchst eine Gold-Gruppe ohne Abo und ohne leere Versprechen?" "Gold-Gruppe *ohne Abo*?" chill 5404 rot2/de_s4.mp4
r pl s1 "Po co płacić za grupy tradingowe, skoro to samo masz za darmo?" "Po co *płacić*, skoro jest za darmo?" chill 6101 rot2/pl_s1.mp4
r pl s2 "Pomysły tradingowe dopiero po transakcji? U nas jest inaczej." "Dopiero *po* transakcji? Nie u nas." lofi 6202 rot2/pl_s2.mp4
r pl s3 "Tak wygląda uczciwa grupa tradingowa – z prawdziwymi screenami." "Tak wygląda *uczciwa* grupa" drive 6303 rot2/pl_s3.mp4
r pl s4 "Szukasz grupy o złocie bez abonamentu i pustych obietnic?" "Grupa o złocie *bez abonamentu*?" chill 6404 rot2/pl_s4.mp4
echo ALLDONE
