import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import * as dotenv from 'dotenv';
dotenv.config();

const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_EMBEDDING_DEPLOYMENT_NAME
});

async function createVectorstore() {
    const loader = new PDFLoader('./BlackJack_Rules.pdf');
    const docs = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200
    });

    const chunks = await splitter.splitDocuments(docs);

    console.log(`PDF opgesplitst in ${chunks.length} stukken.`);

    const vectorStore = await FaissStore.fromDocuments(chunks, embeddings);
    await vectorStore.save("vectordatabase");

    console.log("Vectorstore opgeslagen naar 'vectordatabase'");
}

createVectorstore().catch(console.error);