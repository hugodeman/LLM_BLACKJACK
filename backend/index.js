import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import express from 'express';
import cors from 'cors';
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";

const model = new AzureChatOpenAI({
    temperature: 0.4,
});

const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_EMBEDDING_DEPLOYMENT_NAME
});

let vectorStore;

const app = express();
app.use(cors());
app.use(express.json());

const calculateHandValue = (cards) => {
    let value = 0;
    let aceCount = 0;

    for (const card of cards) {
        if (!card.value) continue;
        if (card.value === "ACE") {
            value += 11;
            aceCount++;
        } else if (["KING", "QUEEN", "JACK"].includes(card.value)) {
            value += 10;
        } else {
            value += parseInt(card.value);
        }
    }

    while (value > 21 && aceCount > 0) {
        value -= 10;
        aceCount--;
    }

    return value;
};

function convertMessages(rawMessages) {
    return rawMessages
        .filter(msg => typeof msg.content === "string" && msg.content.trim() !== "")
        .map((msg) => {
            if (msg.role === "user") {
                return new HumanMessage({ content: msg.content });
            } else if (msg.role === "assistant") {
                return new AIMessage({ content: msg.content });
            } else {
                return null;
            }
        })
        .filter(msg => msg !== null);
}

function generateContext({ action, playerCards, dealerCards, hasStood, lastDrawnCard, rules, bet }) {

    let context = `You are a blackjack dealer. The rules are:\n${rules}\n
    Under no circumstances may a card be reshuffled. Once a card is shown it always keeps that value. You may never
    let the player know what the value of the hidden card is, Unless it is revealed.\n
    
    Respond with Markdown formatting. With icons for the suits and a list of the cards per hand. The lists cant have too much space between each item and the text above.\n\n
    
    You answer short. You never start your own game!\n 
    If a player asks what to do when no cards are drawn, you state that by starting a game you have to place a bet. ex 10 \n
    If a player asks what to do when cards are drawn, you state the total value of the cards and explain that you can press the hit button to draw a card
    to try to get closer to 21. Or the stand button if you think the next card will get you over 21.
    \n\n`;

    if(playerCards) {
        const playerValue = calculateHandValue(playerCards);
        const dealerValue = calculateHandValue(dealerCards);

        const formatCards = (cards) => cards.map(c => `${c.value} of ${c.suit}`).join(" and ");
        const lastCardText = lastDrawnCard ? `${lastDrawnCard.value} of ${lastDrawnCard.suit}` : null;

        const visibleDealer = hasStood
            ? formatCards(dealerCards)
            : dealerCards[0]?.value
                ? `${dealerCards[0].value} of ${dealerCards[0].suit} and one hidden card`
                : "unknown";


        if (action === "start") {
            context += `The game has started. \n The player has bet: ${bet}.
            Player has ${formatCards(playerCards)} (total: ${playerValue}). Dealer shows ${visibleDealer}.
        You name the cards with their house.\n\n`;
        }

        if (action === "hit") {
            context += `Player drew ${lastCardText}. Total hand: ${formatCards(playerCards)} (value: ${playerValue}).
        Name the last drawn card and the new total value of the hand. And only that card, you do not state the full hand anymore.\n
        If the total of the hand is more than 21 you tell the player that he has bust. 
        If the player has 21 you exaggerate the hand total since blackjack is the best hand in the game. \n\n`;
        }

        if (action === "stand") {
            context += `Player stands. Dealer reveals hand: ${formatCards(dealerCards)} (value: ${dealerValue}).\n`;
            context += `Compare hands:\n - Player: ${playerValue}\n - Dealer: ${dealerValue}\n`;
            context += `Announce who wins based on blackjack rules.\n
            If the player didn't bust and has a higher hand than the dealer the player wins.\n
            If the player busts or the player has a lower handvalue than the dealer, the dealer wins.
            `;
            context += `Announce how much money the player has lost or wins. If the player loses he loses hit bet amount.\n
            If the player wins they get their bet as payout. If the player has 21, they get 1.5 times their bet. the bet amount = ${bet}.`
        }
    }
        return context;
}

app.post('/blackjack', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const { messages, playerCards, dealerCards, hasStood, lastDrawnCard, action, bet } = req.body;

    try {
        const vectorStore = await loadVectorStore();
        const lastUserMessage = messages?.filter(m => m.role === "user").at(-1)?.content || "";
        const relevantDocs = await vectorStore.similaritySearch(lastUserMessage, 3);
        const rules = relevantDocs.map(doc => doc.pageContent).join("\n\n");

        const context = generateContext({
            action,
            playerCards,
            dealerCards,
            hasStood,
            lastDrawnCard,
            rules,
            bet
        });

        const chatMessages = [
            new SystemMessage(context),
            ...convertMessages(messages)
        ];

        const stream = await model.stream(chatMessages);
        let ai='';

        for await (const chunk of stream) {
            await new Promise(resolve => setTimeout(resolve,60));
            res.write(chunk.content);
            ai += chunk.content;
        }

        res.end();

    } catch (err) {
        console.error("Fout in /blackjack:", err);
        res.status(500).json({ error: "Interne serverfout tijdens blackjack" });
    }
});

app.post('/blackjack/start', async (req, res) => {
    const deckRes = await fetch('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1');
    const deckData = await deckRes.json();
    const deckId = deckData.deck_id;

    const drawRes = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=4`);
    const drawData = await drawRes.json();
    const cards = drawData.cards;

    const playerCards = cards.slice(0, 2);
    const dealerCards = cards.slice(2, 4);

    res.json({
        deckId,
        playerCards,
        dealerCards,
        responseDealerCards: [dealerCards[0], { code: "HIDDEN" }]
    });
});

app.post('/blackjack/hit', async (req, res) => {
    const { deckId } = req.body;

    try {
        const drawRes = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`);
        const drawData = await drawRes.json();
        const card = drawData.cards[0];

        res.json({ card });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to draw card" });
    }
});

app.post('/blackjack/stand', async (req, res) => {
    const { deckId, dealerCards } = req.body;

    try {
        let updatedDealerCards = [...dealerCards];
        const steps = [];
        let dealerTotal = calculateHandValue(updatedDealerCards);

        while (dealerTotal < 17) {
            const drawRes = await fetch(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`);
            const drawData = await drawRes.json();
            const newCard = drawData.cards[0];
            updatedDealerCards.push(newCard);

            dealerTotal = calculateHandValue(updatedDealerCards);
            steps.push({ dealerCards: [...updatedDealerCards] });
        }

        steps.push({
            dealerCards: updatedDealerCards,
        });

        res.json({ steps });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to complete dealer turn" });
    }
});

async function loadVectorStore() {
    vectorStore = await FaissStore.load("./vectorDatabase", embeddings);
    console.log("Vectorstore geladen.");
}

// loadVectorStore().then(() => {
//     app.listen(8000, () => console.log(`Server draait op http://localhost:8000`));
// });