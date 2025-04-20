import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import express from 'express';
import cors from 'cors';
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";

const model = new AzureChatOpenAI({ temperature: 0.0 });

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

// ✅ Helper om chatgeschiedenis correct te converteren
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

function generateContext({ action, playerCards, dealerCards, hasStood, lastDrawnCard, rules }) {
    const playerValue = calculateHandValue(playerCards);
    const dealerValue = calculateHandValue(dealerCards);

    const formatCards = (cards) => cards.map(c => `${c.value} of ${c.suit}`).join(" and ");
    const lastCardText = lastDrawnCard ? `${lastDrawnCard.value} of ${lastDrawnCard.suit}` : null;

    const visibleDealer = hasStood
        ? formatCards(dealerCards)
        : dealerCards[0]?.value
            ? `${dealerCards[0].value} of ${dealerCards[0].suit} and one hidden card`
            : "unknown";

    let context = `You are a blackjack dealer. The rules are:\n${rules}\n
    Under no circumstances may a card be reshuffled. Once a card is shown it always keeps that value. You may never
    let the player know what the value of the hidden card is, Unless it is revealed.
    \n\n`;

    if (action === "start") {
        context += `The game has started. Player has ${formatCards(playerCards)} (total: ${playerValue}). Dealer shows ${visibleDealer}.
        You name the cards with there house.`;
    }

    if (action === "hit") {
        context += `Player drew ${lastCardText}. Total hand: ${formatCards(playerCards)} (value: ${playerValue}).
        Name the last drawn card and the new total value of the hand. And only that card, you do not state the full hand anymore.`;
    }

    if (action === "stand") {
        context += `Player stands. Dealer reveals hand: ${formatCards(dealerCards)} (value: ${dealerValue}).\n`;
        context += `Compare hands:\n - Player: ${playerValue}\n - Dealer: ${dealerValue}\n`;
        context += `Announce who wins based on blackjack rules.`;
    }

    return context;
}

app.post('/blackjack', async (req, res) => {
    const { messages, playerCards, dealerCards, hasStood, lastDrawnCard, action } = req.body;

    try {
        const lastUserMessage = messages?.filter(m => m.role === "user").at(-1)?.content || "";
        const relevantDocs = await vectorStore.similaritySearch(lastUserMessage, 3);
        const rules = relevantDocs.map(doc => doc.pageContent).join("\n\n");

        const context = generateContext({
            action,
            playerCards,
            dealerCards,
            hasStood,
            lastDrawnCard,
            rules
        });

        const chatMessages = [
            new SystemMessage(context),
            ...convertMessages(messages)
        ];

        const chat = await model.invoke(chatMessages);
        res.json({ chat: chat.content });

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

loadVectorStore().then(() => {
    app.listen(8000, () => console.log(`Server draait op http://localhost:8000`));
});
