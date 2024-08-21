const { Web3 } = require('web3');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// Configurations
const TOKEN = '7531773897:AAFpnVx6hqzcvUpj5pr-RkTiwDihLbzl5m4';
const INFURA_WS_URL = 'wss://mainnet.infura.io/ws/v3/03033dbe3ca2459bb5d96a3c9366a8ac';
const web3 = new Web3(new Web3.providers.WebsocketProvider(INFURA_WS_URL));
const bot = new TelegramBot(TOKEN, { polling: true });


let buyTxMap = new Map(); // To keep track of transactions for different tokens

// Load chat IDs from a file
let chatIds = [];
const chatIdFile = 'chatIds.json';

if (fs.existsSync(chatIdFile)) {
    chatIds = JSON.parse(fs.readFileSync(chatIdFile));
}

// Function to save chat IDs
function saveChatIds() {
    fs.writeFileSync(chatIdFile, JSON.stringify(chatIds));
}

// Function to get transaction count for a token in the last day
async function getTransactionCountLastDay(tokenAddress) {
    const latestBlock = await web3.eth.getBlockNumber();
    const dayInSeconds = 86400; // 24 hours in seconds
    const blocksInOneDay = Math.floor(dayInSeconds / 15); // Ethereum block time ~15 seconds

    const startBlock = latestBlock - blocksInOneDay;

    const events = await web3.eth.getPastLogs({
        address: tokenAddress,
        fromBlock: startBlock,
        toBlock: 'latest',
        topics: [web3.utils.sha3('Transfer(address,address,uint256)')]
    });

    return events.length;
}

// Function to monitor transactions for all tokens
function monitorTransactions() {
    const minBuyTxs = 3;
    const timeWindow = 10 * 60 * 1000; // 10 minutes in milliseconds

    const subscription = web3.eth.subscribe('logs', {
        topics: [web3.utils.sha3('Transfer(address,address,uint256)')]
    }, async (error, log) => {
        if (error) {
            console.error('Subscription error:', error);
            return;
        }

        const tokenAddress = log.address;
        const currentTime = Date.now();

        if (!buyTxMap.has(tokenAddress)) {
            buyTxMap.set(tokenAddress, { count: 0, startTime: currentTime });
        }

        const tokenData = buyTxMap.get(tokenAddress);
        const transactionTime = currentTime - tokenData.startTime;

        if (transactionTime < timeWindow) {
            tokenData.count += 1;
        } else {
            tokenData.startTime = currentTime;
            tokenData.count = 1;
        }

        buyTxMap.set(tokenAddress, tokenData);

        if (tokenData.count >= minBuyTxs) {
            try {
                const txCountYesterday = await getTransactionCountLastDay(tokenAddress);
                if (txCountYesterday <= 1) {
                    sendAlert(tokenAddress);
                }
            } catch (error) {
                console.error('Error getting transaction count for the last day:', error);
            }

            // Optional: Reset count to avoid duplicate alerts within the same 10-minute window
            tokenData.count = 0;
        }




        // if (tokenData.count >= minBuyTxs) {
        //     getTransactionCountLastDay(tokenAddress)
        //         .then(txCountYesterday => {
        //             if (txCountYesterday <= 1) {
        //                 sendAlert(tokenAddress);
        //             }
        //         })
        //         .catch(error => {
        //             console.error('Error getting transaction count for the last day:', error);
        //         });
        // }
    });
}

// Function to send an alert to all stored chat IDs
function sendAlert(tokenAddress) {
    const message = `🚨 Alert! Token at address ${tokenAddress} has had 3 buy transactions within the last 10 minutes and only 1 or fewer transactions yesterday!`;

    chatIds.forEach(chatId => {
        bot.sendMessage(chatId, message);
    });
}

// Function to send a test alert to all stored chat IDs
function sendTestAlert() {
    const message = `🚨 This is a test alert. Your bot is working correctly!`;

    chatIds.forEach(chatId => {
        bot.sendMessage(chatId, message);
    });
}

// Start monitoring
monitorTransactions();

// Listen for any incoming messages and store new chat IDs
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (!chatIds.includes(chatId)) {
        chatIds.push(chatId);
        saveChatIds(); // Save the updated chat IDs list to the file
    }

    // Check for a test command from the user to trigger the test alert
    if (msg.text && msg.text.toLowerCase() === '/testalert') {
        sendTestAlert();
    }
});
