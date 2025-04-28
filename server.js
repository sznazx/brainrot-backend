// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const { OpenAI } = require('openai');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Setup ethers provider and wallet
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Setup OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// NFT Contract ABI (example mint function)
const nftAbi = [
  "function mintTo(address recipient, string memory metadataURI) public returns (uint256)"
];

// NFT contract address
const contractAddress = process.env.CONTRACT_ADDRESS;

// Connect to NFT contract
const nftContract = new ethers.Contract(contractAddress, nftAbi, wallet);

// Upload file to Pinata
async function uploadToPinata(filepath, filename) {
  const data = new FormData();
  data.append('file', fs.createReadStream(filepath), filename);

  const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', data, {
    maxContentLength: Infinity,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
      'pinata_api_key': process.env.PINATA_API_KEY,
      'pinata_secret_api_key': process.env.PINATA_API_SECRET
    }
  });

  return `ipfs://${res.data.IpfsHash}`;
}

// Upload metadata JSON to Pinata
async function uploadMetadataToPinata(metadata) {
  const res = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', metadata, {
    headers: {
      'Content-Type': 'application/json',
      'pinata_api_key': process.env.PINATA_API_KEY,
      'pinata_secret_api_key': process.env.PINATA_API_SECRET
    }
  });

  return `ipfs://${res.data.IpfsHash}`;
}

// Mint Brainrot Animal NFT from user input
app.post('/mint-brainrot-animal', async (req, res) => {
  try {
    const { animal1, animal2 } = req.body;

    if (!animal1) {
      return res.status(400).json({ error: "Please provide at least animal1!" });
    }

    // 1. Create exaggerated mutant description using OpenAI
    let prompt;
    if (animal2) {
      prompt = `Create a wild, hyper-realistic, ultra-detailed mutant fusion of a ${animal1} and a ${animal2}. Photorealistic, cinematic lighting, realistic anatomy, surreal elements.`;
    } else {
      prompt = `Create a wild, hyper-realistic, ultra-detailed surreal version of a ${animal1}. Photorealistic, cinematic lighting, realistic anatomy, surreal elements.`;
    }

    console.log("🧠 Creating realistic mutant description for:", animal1, animal2 ? `and ${animal2}` : "");

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
    });

    const mutantDescription = completion.choices[0].message.content;

    console.log("🎨 Mutated Realistic Description:", mutantDescription);

    // 2. Prepare final prompt for DALL-E 3
    const finalPrompt = mutantDescription + " Ultra-detailed hyper-realistic creature portrait in 8K resolution, cinematic lighting, no text, no words, no letters, pure creature realism.";

    // 3. Generate AI image from OpenAI DALL·E 3
    const imageGen = await openai.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = imageGen.data[0].url;
    console.log("🎨 DALL·E 3 Image URL:", imageUrl);

    // 4. Download the AI-generated image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync('./dynamic_brainrot.png', imageResponse.data);

    console.log("📥 AI Image saved locally!");

    // 5. Upload image to Pinata
    const uploadedImageUrl = await uploadToPinata('./dynamic_brainrot.png', 'dynamic_brainrot.png');

    console.log("📤 Image uploaded to Pinata:", uploadedImageUrl);

    // 6. Create metadata
    const randomId = Math.floor(Math.random() * 1000000);
    const metadata = {
      name: `Brainrot Animal #${randomId}`,
      description: "A hyper-realistic AI-generated mutant creature using OpenAI DALL·E 3.",
      image: uploadedImageUrl,
    };

    // 7. Upload metadata JSON to Pinata
    const metadataUrl = await uploadMetadataToPinata(metadata);

    console.log("📤 Metadata uploaded to Pinata:", metadataUrl);

    // 8. Mint the NFT
    const tx = await nftContract.mintTo(wallet.address, metadataUrl);
    await tx.wait();

    console.log("🚀 NFT Minted! Tx Hash:", tx.hash);

    res.json({
      message: "Hyper-Realistic Brainrot Animal NFT Minted!",
      animal1,
      animal2: animal2 || null,
      mutantDescription,
      imageIPFSUrl: uploadedImageUrl,
      metadataIPFSUrl: metadataUrl,
      transactionHash: tx.hash,
    });

  } catch (error) {
    console.error(error.response?.data || error);
    res.status(500).send('Error minting brainrot animal NFT');
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
