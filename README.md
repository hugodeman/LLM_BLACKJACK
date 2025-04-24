# LLM_BLACKJACK

Dit is een LLM project met GPT3.5 voor een blackjack AI chatbot.

Het project is gemaakt met React + tailwind en Express en gebruikt Langchain en AZURE.

## installatie

Voor het gebruiken van het project moet je een aantal dingen hebben geinstalleerd:

- Node.js
- npm
- Git

Daarna kun je de github repo clonen in je eigen editor.  
! let op dat je een goede mappen structuur houdt !  
frontend:


/client/...


backend:


/server/...


Het project werkt alleen lokaal. Open twee terminals in je editor.
Type in de eerste terminal:
<pre><code>cd client
npm install
npm run start
</code></pre>

Dit start de front end.

Type in de tweede terminal:
<pre><code>cd server
npm install
npm run dev
</code></pre>

Dit start de back end.

## env

De backend gebruikt een .env bestand. Hier moet de API key voor AZURE in. 
Deze zal je zelf moeten aanmaken in de server directory aangezien er gevoelige informatie staat.

Hierin moet staan:

AZURE_OPENAI_API_VERSION=...  
AZURE_OPENAI_API_INSTANCE_NAME=...  
AZURE_OPENAI_API_KEY=...  
AZURE_OPENAI_API_DEPLOYMENT_NAME=...  
AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME=...  


vervang de ... door je eigen API van AZURE.


## spelen

De AI werkt het beste als je in het engels praat.
Start het spel met een inzet plaatsen. Volgens de regels moet het een inzet zijn tussen 2 en 500. Je start met 1000.


Vraag nooit om een spel te starten, maar type een getal tussen 2 en 500 om een spel te starten!
Als het spel begonnen in moet je de knoppen gebruiken om verder te spelen (Hit, Stand).


Als de winnaar bekend is kan je met de reset knop opnieuw spelen. Of door opnieuw een inzet te leggen.


Weet je even niet wat je moet doen of wil je weten wat de regels zijn van blackjack? Vraag de dealer (:



PS. Probeer iets grappigs aan de context te geven. Als je aangeeft in de generateContext() Dat hij naast de dealer Yoda is dan zal de dealer als Yoda terugpraten.


## problemen

De AI kan nogal eens een gek antwoord geven. Rekenen en dus kaarten tellen / aangeven wie er wint, kan hij nog wel een fout aangeven.
Geen zorgen! De AI is alleen voor feedback voor het spel van belang. Op de achtergrond wordt goed bijgehouden wie er gewonnen heeft.
(Als je vraagt hoeveel kaarten je hebt of hoeveel punten je hebt geeft hij meestal het goede antwoord mocht hij iets geks zeggen)


Wanneer het budget van 1000 op is, kan je niet meer verder. Moet je maar beter gokken.
(je kan naar inspect gaan in je browser, naar application navigeren met de >> bovenin en dan naar localstorage en je balance weer aanpassen.)
