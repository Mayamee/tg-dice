require("dotenv").config();
const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const input = require("input");

// Конфигурация
const stringSession = new StringSession(process.env.SESSION ?? "");
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const maxDiceCount = 3;
const maxAttempts = 2;
const diceEmoji = "🎲";

// Вспомогательные функции
const isUntouchedDice = (msg) => msg.out && msg.media?.emoticon === diceEmoji;
const isWinningRoll = (value) => value >= maxDiceCount;
const deleteMessage = (client, peer, msgId) =>
  client.deleteMessages(peer, [msgId], true);
const sendDice = (client, peer) =>
  client.sendFile(peer, {
    file: new Api.InputMediaDice({ emoticon: diceEmoji }),
    silent: true,
  });

const rollDiceWithRetries = async (client, peer) => {
  let attempt = 1;
  let diceMsg;
  let rollValue = 0;

  while (true) {
    diceMsg = await sendDice(client, peer);
    rollValue = diceMsg.dice?.value || 0;
    attempt++;

    if (isWinningRoll(rollValue)) {
      break;
    }

    if (attempt >= maxAttempts) {
      break;
    }

    // Удаляем неудачный бросок и повторяем
    await deleteMessage(client, peer, diceMsg.id);
  }
};

(async () => {
  // Инициализация клиента
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Enter your phone number: "),
    password: async () =>
      await input.text("Two‑step verification password (if any): "),
    phoneCode: async () => await input.text("Enter the code you received: "),
    onError: (err) => console.error("Start error:", err),
  });

  console.log("Your session string:", client.session.save());

  // Основной обработчик событий
  client.addEventHandler(async ({ message: msg }) => {
    const peer = msg.peerId;
    if (!isUntouchedDice(msg)) {
      return;
    }

    const initialRoll = msg.media.value || 0;

    if (isWinningRoll(initialRoll)) {
      return;
    }

    // Удаляем первый неудачный бросок и пробуем повторить
    await deleteMessage(client, peer, msg.id);
    await rollDiceWithRetries(client, peer);
  }, new NewMessage({}));
})();
