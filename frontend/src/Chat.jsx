import { useEffect, useRef, useState } from "react";
import showdown from "showdown";

function Chat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    const bottomRef = useRef(null);
    const converter = new showdown.Converter();

    const [deckId, setDeckId] = useState(null);
    const [playerCards, setPlayerCards] = useState(null);
    const [dealerCards, setDealerCards] = useState(null);
    const [visibleDealerCards, setVisibleDealerCards] = useState([]);

    const [hasStood, setHasStood] = useState(false);
    let [endpoint, setEndpoint] = useState("http://localhost:8000/blackjack");

    const [balance, setBalance] = useState(() => {
        const storedBalance = localStorage.getItem("balance");
        return storedBalance ? parseInt(storedBalance) : 1000;
    });
    const [bet,setBet] = useState(0);

    useEffect(() => {
        localStorage.setItem("balance", balance);
    }, [balance]);

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

    // voor het typen naar de bot en het starten
    const handleSend = async (e) => {
        e.preventDefault();

        // voorkomt lege inputs
        if (!input.trim()) return;

        const userMessage = { role: "user", content: input };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setLoading(true);

        try {
            let url = endpoint;
            let body = {
                messages: newMessages,
                playerCards,
                dealerCards,
                hasStood,
                action: 'start'
            };

            const betAmount = parseInt(input.trim(), 10);

            if (!isNaN(betAmount) && betAmount >= 2 && betAmount <= 500) {
                const balance = parseInt(localStorage.getItem("balance") || "1000", 10);
                if (betAmount > balance) {
                    alert("Je hebt niet genoeg saldo.");
                    setLoading(false);
                    return;
                }

                setBet(betAmount)
                setBalance(prev => prev - betAmount);

                url = "http://localhost:8000/blackjack/start";
                const startRes = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bet: betAmount })
                });

                if (!startRes.ok) {
                    const errorText = await startRes.text();
                    console.error("Start error:", startRes.status, errorText);
                    throw new Error("Start error: " + startRes.status);
                }

                const data = await startRes.json();
                setPlayerCards(data.playerCards);
                setDealerCards(data.dealerCards);
                setVisibleDealerCards(data.responseDealerCards);
                setDeckId(data.deckId);
                setHasStood(false);

                // stuur extra bericht naar de AI voor het starten van het spel
                const aiRes = await fetch("http://localhost:8000/blackjack", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: newMessages,
                        playerCards: data.playerCards,
                        dealerCards: data.dealerCards,
                        hasStood: false,
                        action: 'start',
                        bet: betAmount
                    }),
                });

                if (!aiRes.ok) {
                    const errorText = await aiRes.text();
                    console.error("AI Response error:", aiRes.status, errorText);
                    throw new Error("AI Response error: " + aiRes.status);
                }

                const reader = aiRes.body.getReader();
                const decoder = new TextDecoder();
                let done = false;
                let message = '';

                setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

                while (!done) {
                    const { value, done: isDone } = await reader.read();
                    done = isDone;
                    message += decoder.decode(value, { stream: true });

                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: message
                        };
                        return updated;
                    });
                }

                setEndpoint("http://localhost:8000/blackjack");

            } else {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("Server returned error:", response.status, errorText);
                    throw new Error("Server error: " + response.status);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let done = false;
                let message = '';

                setMessages(prev => [...prev, { role: 'assistant', content: '' }]); // Voeg placeholder toe

                while (!done) {
                    const { value, done: isDone } = await reader.read();
                    done = isDone;
                    message += decoder.decode(value, { stream: true });

                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            content: message
                        };
                        return updated;
                    });
                }

                const resData = await response.json();
                if (resData.playerCards) setPlayerCards(resData.playerCards);
                if (resData.dealerCards) setDealerCards(resData.dealerCards);
                if (resData.deckId) setDeckId(resData.deckId);
            }
        } catch (error) {
            console.error("Fout bij versturen:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth"});
    }, [messages]);

    const handleHit = async () => {
        try {
            const res = await fetch("http://localhost:8000/blackjack/hit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deckId }),
            });
            const data = await res.json();
            setPlayerCards(prev => [...prev, data.card]);

            // voor feedback na elke kaart van speler
            const chatRes = await fetch("http://localhost:8000/blackjack", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages,
                    playerCards: [...playerCards, data.card],
                    dealerCards,
                    hasStood,
                    lastDrawnCard: data.card,
                    action: 'hit'
                }),
            });

            if (!chatRes.ok) {
                const errorText = await chatRes.text();
                console.error("AI Response error:", chatRes.status, errorText);
                throw new Error("AI Response error: " + chatRes.status);
            }

            const reader = chatRes.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let message = '';

            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            while (!done) {
                const { value, done: isDone } = await reader.read();
                done = isDone;
                message += decoder.decode(value, { stream: true });

                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        content: message
                    };
                    return updated;
                });
            }

        } catch (e) {
            console.error("Kon geen kaart trekken.", e);
        }
    };

    const handleStand = async () => {
        try {
            setHasStood(true);
            const res = await fetch("http://localhost:8000/blackjack/stand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deckId,
                    dealerCards,
                    action: 'stand'
                }),
            });

            const data = await res.json();
            const steps = data.steps;

            steps.forEach((step, index) => {
                setTimeout(() => {
                    if (index === steps.length - 1) {
                        setDealerCards(step.dealerCards);

                        const playerTotal = calculateHandValue(playerCards);
                        const dealerTotal = calculateHandValue(step.dealerCards);

                        let newBalance = balance;

                        if (
                            (playerTotal <= 21 && dealerTotal > 21) ||
                            (playerTotal > dealerTotal && playerTotal <= 21)
                        ) {
                            let winst = bet;

                            if (playerTotal === 21) {
                                winst = Math.floor(bet * 1.5);
                            }

                            newBalance += bet + winst;
                            setBalance(newBalance);
                            localStorage.setItem("balance", newBalance);
                        }

                        else if (playerTotal === dealerTotal && playerTotal <= 21) {
                            newBalance += bet;
                            setBalance(newBalance);
                            localStorage.setItem("balance", newBalance);
                        }

                        // voor feedback van dealer kaarten
                        fetch("http://localhost:8000/blackjack", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                messages,
                                playerCards,
                                dealerCards: step.dealerCards,
                                hasStood: true,
                                action: 'stand',
                            }),
                        })
                            .then(async (res) => {
                                const reader = res.body.getReader();
                                const decoder = new TextDecoder();
                                let done = false;
                                let message = '';

                                setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

                                while (!done) {
                                    const { value, done: isDone } = await reader.read();
                                    done = isDone;
                                    message += decoder.decode(value, { stream: true });

                                    setMessages(prev => {
                                        const updated = [...prev];
                                        updated[updated.length - 1] = {
                                            ...updated[updated.length - 1],
                                            content: message
                                        };
                                        return updated;
                                    });
                                }
                            })
                            .catch((err) => {
                                console.error("AI-call after stand failed:", err);
                            });
                    }
                }, 1200);
            });

        } catch (e) {
            console.error("Error during stand:", e);
        }
    };

    const handleNewChat = () => {
        setMessages([]);
        setInput("");
        setPlayerCards(null);
        setDealerCards(null);
        setDeckId(null);
        setHasStood(false);
    };

    function renderCard(card) {
        if (card === "HIDDEN") {
            return (
                <div className="w-20 h-28 bg-gray-700 rounded shadow-inner flex items-center justify-center text-white text-lg scale-125">
                    🎴
                </div>
            );
        }

        return (
            <div className="w-20 h-28 scale-125">
                <img
                    src={card.image}
                    alt={`${card.value} of ${card.suit}`}
                    className="w-full h-full object-cover rounded"
                />
            </div>
        );
    }

    return (
        <>
            <header className="bg-gradient-to-br from-[#1a1a1a] to-[#2c2c2c] text-yellow-400 py-4 shadow-lg flex border-b border-yellow-600">
                <div className="container mx-auto px-6 flex items-center justify-between">
                    <h1 className="text-4xl font-bold text-center tracking-widest shadow-xl">
                        🎰 Casino Chatbot
                    </h1>
                    <div className="flex flex-col text-right">
                        <p className="text-sm">Huidig saldo:</p>
                        <p className="text-2xl text-white font-bold">€{balance}</p>
                    </div>
                </div>
            </header>
            <main className="container mx-auto px-6 py-6 bg-gradient-to-br from-[#3a3a3a] to-[#4a4a4a] min-h-screen">
                <div className={'flex flex-row items-center'}>
                    {playerCards ? (
                        <div>
                            <div>
                                <h2 className={'text-white'}>Player cards:</h2>
                                <br/>
                            </div>
                            <div
                                className={`${
                                    playerCards.length <= 2
                                        ? 'flex flex-row space-x-8 gap-2'
                                        : 'grid grid-cols-2 gap-8'
                                }`}>
                                {playerCards.map((card, index) => (
                                    <div key={index}>
                                        {renderCard(card)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div></div>
                    )}

                    <div
                        className="max-w-xl mx-auto py-4 px-20 bg-gradient-to-br from-[#1a1a1a] to-[#2c2c2c] min-h-screen text-gold-100 font-serif">
                        <h1 className="text-3xl font-bold mb-6 text-center text-yellow-400 drop-shadow">🃏 Blackjack
                            Chatbot</h1>

                        <div>
                            <div
                                className="bg-[#1e1e1e] rounded-lg shadow-xl p-4 h-96 overflow-y-auto mb-4 space-y-2 border border-yellow-600">
                                {messages.length === 0 && (
                                    <p className="text-gray-500 text-center italic">Place your bet to start, or ask me anything.</p>
                                )}
                                {messages.map((msg, index) => (
                                    <div
                                        key={index}
                                        className={`p-3 rounded-lg max-w-[90%] ${msg.role === "user"
                                            ? "bg-[#3b3b3b] text-yellow-300 self-end ml-auto"
                                            : "bg-[#292929] text-white"
                                        }`}>
                                        <p className="whitespace-pre-wrap"
                                           dangerouslySetInnerHTML={{__html: converter.makeHtml(msg.content)}}></p>
                                    </div>
                                ))}
                                <div ref={bottomRef}/>
                            </div>
                        </div>

                        <form onSubmit={handleSend} className="flex space-x-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                className="flex-grow bg-[#2a2a2a] border border-yellow-600 text-white px-3 py-2 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                placeholder="Type here"
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-yellow-500 text-black font-semibold px-4 py-2 rounded-lg hover:bg-yellow-400 disabled:opacity-50"
                            >
                                Send
                            </button>
                            <button
                                type="button"
                                onClick={handleNewChat}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-500"
                            >
                                Reset
                            </button>
                        </form>
                        {playerCards ? (
                            <div>
                                <button
                                    onClick={handleHit}
                                    className="bg-blue-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-50 mt-5"
                                    disabled={hasStood || calculateHandValue(playerCards) >= 21}
                                >
                                    Hit
                                </button>
                                <button
                                    onClick={handleStand}
                                    className="ml-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-500 disabled:opacity-50"
                                    disabled={hasStood || calculateHandValue(playerCards) > 21}
                                >
                                    Stand
                                </button>
                            </div>
                        ) : (
                            <div>

                            </div>
                        )}
                    </div>

                    {dealerCards ? (
                        <div>
                            <div>
                                <h2 className={'text-white'}>Dealer cards:</h2>
                                <br/>
                            </div>
                            <div
                                className={`${
                                    dealerCards.length <= 2
                                        ? 'flex flex-row space-x-8 gap-2'
                                        : 'grid grid-cols-2 gap-8'
                                }`}>
                                {dealerCards.map((card, index) => {
                                    if (!hasStood && index === 1) {
                                        return <div key={index}>{renderCard("HIDDEN")}</div>;
                                    }
                                    return <div key={index}>{renderCard(card)}</div>;
                                })}
                            </div>
                        </div>
                    ) : (
                        <div></div>
                    )}
                </div>
            </main>
        </>
    );
}

export default Chat;