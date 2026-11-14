"""Übersetzte Fassungen der YouTube-Tutorials (Konto eröffnen, MT5 verbinden).
python3 tut/localize.py konto|mt5 en|pl out.mp4 [preview]
Ersetzt die deutschen Texte (Sprechtext, Beschriftungen, Karten) im Quelltext und rendert mit der Stimme in der Zielsprache.
Hinweis: Die Screenshots (Ultima-Kundenbereich, MT5-App) bleiben die Originale.
"""
import os, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))

KONTO = {
 "en": {
  "Registrieren": "Register", "Bestätigen": "Confirm", "Konto eröffnen": "Open account", "Verifizieren": "Verify",
  "In diesem Video eröffnest du dein Konto bei unserem Partnerbroker Ultima – Schritt für Schritt, in etwa zehn Minuten. Wichtig: Öffne die Seite über unseren Link in der Videobeschreibung. Nur so wird dein Konto uns zugeordnet.":
   "In this video you'll open your account with our partner broker Ultima – step by step, in about ten minutes. Important: open the page via our link in the video description. That's the only way your account is assigned to us.",
  "Über den Link landest du auf dieser Seite: Live-Konto eröffnen.": "The link takes you to this page: open a live account.",
  "Wähle dein Wohnsitzland und trag deinen Vornamen ein.": "Choose your country of residence and enter your first name.",
  "Dann deine E-Mail-Adresse und ein sicheres Passwort, das du dir gut merken kannst.": "Then your email address and a secure password you can easily remember.",
  "Das Feld Empfehler lässt du einfach leer. Weil du über unseren Link gekommen bist, wird dein Konto automatisch uns zugeordnet.": "Just leave the referrer field empty. Because you came through our link, your account is assigned to us automatically.",
  "Wähle Individuum, setz die beiden Häkchen und tippe auf Konto erstellen.": "Choose individual, tick both boxes and tap create account.",
  "Jetzt bestätigst du deine E-Mail-Adresse und deine Telefonnummer – jeweils mit dem Code, den du zugeschickt bekommst. Beides ist Pflicht.": "Now confirm your email address and your phone number – each with the code you receive. Both are required.",
  "Im Kundenbereich gehst du oben auf Konten und dann rechts auf Konto eröffnen.": "In the client area, go to accounts at the top and then to open account on the right.",
  "Wähle Echtgeldkonto. Neu im Trading? Dann kannst du hier auch zuerst ein Demokonto eröffnen und in Ruhe üben.": "Choose live account. New to trading? Then you can also open a demo account here first and practise in peace.",
  "Als Plattform nimmst du MetaTrader 5. Und beim Kontotyp wählst du Standard STP.": "As the platform, take MetaTrader 5. And for the account type, choose Standard STP.",
  "Als Kontowährung Euro. Dann das Häkchen setzen, die Bedingungen kurz lesen und auf Absenden.": "Choose your account currency. Then tick the box, read the terms briefly and tap submit.",
  "Für das Live-Konto bestätigst du zum Schluss deine Identität mit deinem Ausweis. Das dauert etwa fünf bis zehn Minuten und ist bei Brokern Standard.": "Finally, for the live account you verify your identity with your ID. It takes about five to ten minutes and is standard with brokers.",
  "Fertig! Im nächsten Video verbindest du dein Konto mit MetaTrader 5. Und wenn du so weit bist, schick deine UID an unseren Telegram-Bot – dann schalten wir dich frei.": "Done! In the next video you'll connect your account to MetaTrader 5. And when you're ready, send your UID to our Telegram bot – then we'll unlock your access.",
  "Wohnsitzland": "Country of residence", "Vorname": "First name", "E-Mail": "Email", "Passwort": "Password", "Leer lassen": "Leave empty",
  "Individuum": "Individual", "Beide Häkchen": "Both boxes", "Konto erstellen": "Create account", "Konten": "Accounts",
  "Echtgeldkonto": "Live account", "Zum Üben: Demokonto": "To practise: demo account", "Euro": "Currency", "Häkchen setzen": "Tick the box", "Absenden": "Submit",
  "Ultima-Konto eröffnen": "Open an Ultima account", "Schritt für Schritt · ca. 10 Minuten": "Step by step · about 10 minutes",
  "Wichtig: nur über unseren Link (Beschreibung) registrieren": "Important: register only via our link (description)",
  "E-Mail bestätigen": "Confirm email", "Code aus der Mail eingeben": "Enter the code from the email",
  "Telefonnummer bestätigen": "Confirm phone number", "Code per SMS eingeben": "Enter the code from the SMS",
  "Ausweis hochladen": "Upload your ID", "Personalausweis oder Reisepass": "ID card or passport", "Ca. 5–10 Minuten": "About 5–10 minutes",
  "Danach ist dein Live-Konto aktiv": "Then your live account is active", "Identität verifizieren": "Verify identity",
  "Konto eröffnet ✓": "Account opened ✓", "Nächstes Video": "Next video", "MT5 verbinden": "Connect MT5", "Dann": "Then",
  "UID an unseren Bot": "UID to our bot", "Fragen?": "Questions?", "Schreib uns im Bot": "Message us in the bot",
  "🔒 Ultima – Kundenbereich": "🔒 Ultima – Client area", "Schematische Anleitung · Keine Anlageberatung": "Schematic guide · Not investment advice",
 },
 "pl": {
  "Registrieren": "Rejestracja", "Bestätigen": "Potwierdzenie", "Konto eröffnen": "Otwórz konto", "Verifizieren": "Weryfikacja",
  "In diesem Video eröffnest du dein Konto bei unserem Partnerbroker Ultima – Schritt für Schritt, in etwa zehn Minuten. Wichtig: Öffne die Seite über unseren Link in der Videobeschreibung. Nur so wird dein Konto uns zugeordnet.":
   "W tym filmie otworzysz konto u naszego brokera partnerskiego Ultima – krok po kroku, w około dziesięć minut. Ważne: otwórz stronę przez nasz link w opisie filmu. Tylko wtedy twoje konto zostanie do nas przypisane.",
  "Über den Link landest du auf dieser Seite: Live-Konto eröffnen.": "Link prowadzi cię na tę stronę: otwarcie konta rzeczywistego.",
  "Wähle dein Wohnsitzland und trag deinen Vornamen ein.": "Wybierz kraj zamieszkania i wpisz swoje imię.",
  "Dann deine E-Mail-Adresse und ein sicheres Passwort, das du dir gut merken kannst.": "Potem adres e-mail i bezpieczne hasło, które łatwo zapamiętasz.",
  "Das Feld Empfehler lässt du einfach leer. Weil du über unseren Link gekommen bist, wird dein Konto automatisch uns zugeordnet.": "Pole polecającego zostaw puste. Ponieważ wszedłeś przez nasz link, twoje konto zostanie automatycznie do nas przypisane.",
  "Wähle Individuum, setz die beiden Häkchen und tippe auf Konto erstellen.": "Wybierz osobę fizyczną, zaznacz oba pola i kliknij utwórz konto.",
  "Jetzt bestätigst du deine E-Mail-Adresse und deine Telefonnummer – jeweils mit dem Code, den du zugeschickt bekommst. Beides ist Pflicht.": "Teraz potwierdzasz adres e-mail i numer telefonu – za każdym razem kodem, który otrzymasz. Oba kroki są obowiązkowe.",
  "Im Kundenbereich gehst du oben auf Konten und dann rechts auf Konto eröffnen.": "W panelu klienta wybierz u góry konta, a potem po prawej otwórz konto.",
  "Wähle Echtgeldkonto. Neu im Trading? Dann kannst du hier auch zuerst ein Demokonto eröffnen und in Ruhe üben.": "Wybierz konto rzeczywiste. Dopiero zaczynasz? Możesz tu najpierw otworzyć konto demo i spokojnie poćwiczyć.",
  "Als Plattform nimmst du MetaTrader 5. Und beim Kontotyp wählst du Standard STP.": "Jako platformę wybierz MetaTrader 5. A jako typ konta Standard STP.",
  "Als Kontowährung Euro. Dann das Häkchen setzen, die Bedingungen kurz lesen und auf Absenden.": "Wybierz walutę konta. Potem zaznacz pole, krótko przeczytaj warunki i kliknij wyślij.",
  "Für das Live-Konto bestätigst du zum Schluss deine Identität mit deinem Ausweis. Das dauert etwa fünf bis zehn Minuten und ist bei Brokern Standard.": "Na koniec, dla konta rzeczywistego, potwierdzasz tożsamość dokumentem. Trwa to około pięciu do dziesięciu minut i jest standardem u brokerów.",
  "Fertig! Im nächsten Video verbindest du dein Konto mit MetaTrader 5. Und wenn du so weit bist, schick deine UID an unseren Telegram-Bot – dann schalten wir dich frei.": "Gotowe! W następnym filmie połączysz konto z MetaTrader 5. A gdy będziesz gotowy, wyślij swoje UID do naszego bota na Telegramie – wtedy odblokujemy ci dostęp.",
  "Wohnsitzland": "Kraj zamieszkania", "Vorname": "Imię", "E-Mail": "E-mail", "Passwort": "Hasło", "Leer lassen": "Zostaw puste",
  "Individuum": "Osoba fizyczna", "Beide Häkchen": "Oba pola", "Konto erstellen": "Utwórz konto", "Konten": "Konta",
  "Echtgeldkonto": "Konto rzeczywiste", "Zum Üben: Demokonto": "Do ćwiczeń: konto demo", "Euro": "Waluta", "Häkchen setzen": "Zaznacz pole", "Absenden": "Wyślij",
  "Ultima-Konto eröffnen": "Otwórz konto Ultima", "Schritt für Schritt · ca. 10 Minuten": "Krok po kroku · ok. 10 minut",
  "Wichtig: nur über unseren Link (Beschreibung) registrieren": "Ważne: rejestruj się tylko przez nasz link (opis)",
  "E-Mail bestätigen": "Potwierdź e-mail", "Code aus der Mail eingeben": "Wpisz kod z e-maila",
  "Telefonnummer bestätigen": "Potwierdź numer telefonu", "Code per SMS eingeben": "Wpisz kod z SMS-a",
  "Ausweis hochladen": "Prześlij dokument", "Personalausweis oder Reisepass": "Dowód osobisty lub paszport", "Ca. 5–10 Minuten": "Ok. 5–10 minut",
  "Danach ist dein Live-Konto aktiv": "Potem twoje konto jest aktywne", "Identität verifizieren": "Weryfikacja tożsamości",
  "Konto eröffnet ✓": "Konto otwarte ✓", "Nächstes Video": "Następny film", "MT5 verbinden": "Połącz MT5", "Dann": "Potem",
  "UID an unseren Bot": "UID do naszego bota", "Fragen?": "Pytania?", "Schreib uns im Bot": "Napisz do nas w bocie",
  "🔒 Ultima – Kundenbereich": "🔒 Ultima – Panel klienta", "Schematische Anleitung · Keine Anlageberatung": "Instrukcja schematyczna · To nie jest porada inwestycyjna",
 },
}

MT5 = {
 "en": {
  "Zugangsdaten": "Login details", "App öffnen": "Open app", "Broker wählen": "Choose broker", "Einloggen": "Log in",
  "In diesem Video verbindest du dein Ultima-Konto mit der MetaTrader-5-App. Du brauchst dafür nur drei Dinge: deinen Login, dein Passwort und den Server.": "In this video you'll connect your Ultima account to the MetaTrader 5 app. You only need three things: your login, your password and the server.",
  "Nach der Kontoeröffnung bekommst du von Ultima eine E-Mail mit deinen Zugangsdaten: MT5-Login, MT5-Passwort und MT5-Server. Genau diese drei brauchst du gleich.": "After opening your account, Ultima sends you an email with your login details: MT5 login, MT5 password and MT5 server. You'll need exactly these three in a moment.",
  "Öffne die MetaTrader-5-App. Tippe unten rechts auf Einstellungen und dann ganz oben auf dein Konto.": "Open the MetaTrader 5 app. Tap settings at the bottom right and then your account at the very top.",
  "Jetzt siehst du die Übersicht deiner Konten. Tippe oben rechts auf das Plus.": "Now you see the overview of your accounts. Tap the plus at the top right.",
  "Gib oben im Suchfeld Ultima ein und wähle Ultima Markets Ltd aus.": "Type Ultima into the search field at the top and select Ultima Markets Ltd.",
  "Wichtig ist der Server: Tippe drauf und wähle genau den Server aus deiner E-Mail – zum Beispiel UltimaMarkets-Live 2. Live 1 und Live 2 sind nicht dasselbe.": "The server is important: tap it and choose exactly the server from your email – for example UltimaMarkets-Live 2. Live 1 and Live 2 are not the same.",
  "Bei Login trägst du die Nummer aus MT5 Login ein, bei Passwort das MT5-Passwort aus der Mail – achte auf Groß- und Kleinschreibung. Dann unten auf Login.": "In login, enter the number from MT5 login, in password the MT5 password from the email – watch upper and lower case. Then tap login at the bottom.",
  "Geschafft – dein Konto ist jetzt mit MetaTrader 5 verbunden. Ganz wichtig: Gib dein Passwort niemals weiter, auch nicht an uns. Für den VIP-Zugang brauchen wir nur deine UID.": "Done – your account is now connected to MetaTrader 5. Very important: never share your password, not even with us. For VIP access we only need your UID.",
  "MT5 Login": "MT5 login", "MT5 Passwort": "MT5 password", "MT5 Server": "MT5 server", "Einstellungen": "Settings", "Konten": "Accounts",
  "Neues Konto": "New account", "Ultima suchen": "Search Ultima", "Server aus der E-Mail": "Server from the email", "MT5 Login (Zahl)": "MT5 login (number)",
  "Die Zugangs-E-Mail": "The login email", "MetaTrader 5 öffnen": "Open MetaTrader 5", "Konto hinzufügen": "Add account", "Broker auswählen": "Select broker",
  "Server wählen": "Choose server", "Login & Passwort": "Login & password",
  "Kommt nach der Kontoeröffnung": "Arrives after opening the account", "Login = Kontonummer": "Login = account number", "Passwort & Server notieren": "Note password & server",
  "App aus dem App Store / Play Store": "App from the App Store / Play Store", "Unten rechts: Einstellungen": "Bottom right: settings", "Oben: dein Konto antippen": "Top: tap your account",
  "Übersicht aller Konten": "Overview of all accounts", "Oben rechts aufs Plus": "Tap the plus at the top right",
  "„Ultima“ ins Suchfeld": "“Ultima” in the search field", "Ultima Markets Ltd antippen": "Tap Ultima Markets Ltd",
  "Genau den Server aus der Mail": "Exactly the server from the email", "z. B. UltimaMarkets-Live 2": "e.g. UltimaMarkets-Live 2",
  "Login = Nummer aus der Mail": "Login = number from the email", "Passwort genau abtippen": "Type the password exactly", "Dann auf Login": "Then tap login",
  "MetaTrader 5 verbinden": "Connect MetaTrader 5", "Ultima-Konto in 2 Minuten in der App": "Your Ultima account in the app in 2 minutes",
  "Passwort": "Password", "Verbunden ✓": "Connected ✓", "Passwort niemals weitergeben – auch nicht an uns": "Never share your password – not even with us",
  "Für den VIP-Zugang brauchen wir nur deine UID → im Telegram-Bot senden": "For VIP access we only need your UID → send it in the Telegram bot",
 },
 "pl": {
  "Zugangsdaten": "Dane logowania", "App öffnen": "Otwórz aplikację", "Broker wählen": "Wybierz brokera", "Einloggen": "Zaloguj się",
  "In diesem Video verbindest du dein Ultima-Konto mit der MetaTrader-5-App. Du brauchst dafür nur drei Dinge: deinen Login, dein Passwort und den Server.": "W tym filmie połączysz konto Ultima z aplikacją MetaTrader 5. Potrzebujesz tylko trzech rzeczy: loginu, hasła i serwera.",
  "Nach der Kontoeröffnung bekommst du von Ultima eine E-Mail mit deinen Zugangsdaten: MT5-Login, MT5-Passwort und MT5-Server. Genau diese drei brauchst du gleich.": "Po otwarciu konta Ultima wyśle ci e-mail z danymi logowania: login MT5, hasło MT5 i serwer MT5. Właśnie tych trzech danych zaraz będziesz potrzebować.",
  "Öffne die MetaTrader-5-App. Tippe unten rechts auf Einstellungen und dann ganz oben auf dein Konto.": "Otwórz aplikację MetaTrader 5. Dotknij ustawień w prawym dolnym rogu, a potem swojego konta na samej górze.",
  "Jetzt siehst du die Übersicht deiner Konten. Tippe oben rechts auf das Plus.": "Teraz widzisz przegląd swoich kont. Dotknij plusa w prawym górnym rogu.",
  "Gib oben im Suchfeld Ultima ein und wähle Ultima Markets Ltd aus.": "Wpisz Ultima w polu wyszukiwania u góry i wybierz Ultima Markets Ltd.",
  "Wichtig ist der Server: Tippe drauf und wähle genau den Server aus deiner E-Mail – zum Beispiel UltimaMarkets-Live 2. Live 1 und Live 2 sind nicht dasselbe.": "Ważny jest serwer: dotknij go i wybierz dokładnie serwer z e-maila – na przykład UltimaMarkets-Live 2. Live 1 i Live 2 to nie to samo.",
  "Bei Login trägst du die Nummer aus MT5 Login ein, bei Passwort das MT5-Passwort aus der Mail – achte auf Groß- und Kleinschreibung. Dann unten auf Login.": "W polu login wpisz numer z loginu MT5, w polu hasło hasło MT5 z e-maila – uważaj na wielkie i małe litery. Potem dotknij zaloguj na dole.",
  "Geschafft – dein Konto ist jetzt mit MetaTrader 5 verbunden. Ganz wichtig: Gib dein Passwort niemals weiter, auch nicht an uns. Für den VIP-Zugang brauchen wir nur deine UID.": "Gotowe – twoje konto jest teraz połączone z MetaTrader 5. Bardzo ważne: nigdy nikomu nie podawaj hasła, nawet nam. Do dostępu VIP potrzebujemy tylko twojego UID.",
  "MT5 Login": "Login MT5", "MT5 Passwort": "Hasło MT5", "MT5 Server": "Serwer MT5", "Einstellungen": "Ustawienia", "Konten": "Konta",
  "Neues Konto": "Nowe konto", "Ultima suchen": "Szukaj Ultima", "Server aus der E-Mail": "Serwer z e-maila", "MT5 Login (Zahl)": "Login MT5 (numer)",
  "Die Zugangs-E-Mail": "E-mail z danymi", "MetaTrader 5 öffnen": "Otwórz MetaTrader 5", "Konto hinzufügen": "Dodaj konto", "Broker auswählen": "Wybierz brokera",
  "Server wählen": "Wybierz serwer", "Login & Passwort": "Login i hasło",
  "Kommt nach der Kontoeröffnung": "Przychodzi po otwarciu konta", "Login = Kontonummer": "Login = numer konta", "Passwort & Server notieren": "Zapisz hasło i serwer",
  "App aus dem App Store / Play Store": "Aplikacja z App Store / Play Store", "Unten rechts: Einstellungen": "Prawy dolny róg: ustawienia", "Oben: dein Konto antippen": "U góry: dotknij swojego konta",
  "Übersicht aller Konten": "Przegląd wszystkich kont", "Oben rechts aufs Plus": "Plus w prawym górnym rogu",
  "„Ultima“ ins Suchfeld": "„Ultima” w polu wyszukiwania", "Ultima Markets Ltd antippen": "Dotknij Ultima Markets Ltd",
  "Genau den Server aus der Mail": "Dokładnie serwer z e-maila", "z. B. UltimaMarkets-Live 2": "np. UltimaMarkets-Live 2",
  "Login = Nummer aus der Mail": "Login = numer z e-maila", "Passwort genau abtippen": "Przepisz hasło dokładnie", "Dann auf Login": "Potem zaloguj",
  "MetaTrader 5 verbinden": "Połącz MetaTrader 5", "Ultima-Konto in 2 Minuten in der App": "Konto Ultima w aplikacji w 2 minuty",
  "Passwort": "Hasło", "Verbunden ✓": "Połączono ✓", "Passwort niemals weitergeben – auch nicht an uns": "Nigdy nie podawaj hasła – nawet nam",
  "Für den VIP-Zugang brauchen wir nur deine UID → im Telegram-Bot senden": "Do dostępu VIP potrzebujemy tylko UID → wyślij je w bocie na Telegramie",
 },
}
STEP = {"en": "Step", "pl": "Krok"}


def load(name, path, tr, lang, extra=()):
    src = open(path, encoding="utf-8").read()
    for de, x in sorted(tr.items(), key=lambda kv: -len(kv[0])):
        q = f'"{de}"'
        if q in src: src = src.replace(q, '"' + x.replace('"', '\\"') + '"')
    for a, b in extra: src = src.replace(a, b)
    src = src.replace('V.synth(s["say"], "de"', f'V.synth(s["say"], "{lang}"')
    mod = types.ModuleType(name); mod.__file__ = path; mod.__name__ = name; sys.modules[name] = mod
    exec(compile(src, path, "exec"), mod.__dict__)
    return mod


def main():
    which, lang, out = sys.argv[1], sys.argv[2], sys.argv[3]
    sys.path.insert(0, HERE)
    K = load("konto", os.path.join(HERE, "konto.py"), KONTO[lang], lang, [('os.path.join(HERE, "work")', f'os.path.join(HERE, "work_{lang}")')])
    if which == "konto":
        mod = K
    else:
        mod = load("mt5", os.path.join(HERE, "mt5.py"), MT5[lang], lang,
                   [('os.path.join(HERE, "work_mt5")', f'os.path.join(HERE, "work_mt5_{lang}")'), ('f"Schritt {', f'f"{STEP[lang]} {{')])
    # verbleibende deutsche Texte melden
    if len(sys.argv) > 4 and sys.argv[4] == "preview":
        sys.argv = [sys.argv[0], out, "preview"]
        src = open(os.path.join(HERE, which + ".py"), encoding="utf-8").read()
        main_block = src.split('if __name__ == "__main__":')[1]
        exec("if True:" + main_block, (mod if which == "konto" else sys.modules["mt5"]).__dict__)
    else:
        K.main(out)


if __name__ == "__main__":
    main()
