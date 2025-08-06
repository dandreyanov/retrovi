const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'rooms.json');

// Загружаем состояние из файла (или стартуем с пустого)
let rooms = {};
try {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  rooms = JSON.parse(raw);
} catch (e) {
  rooms = {};
}

// Функция сохранения в файл
function saveRooms() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API для списка комнат
app.get('/rooms', (req, res) => {
  res.json({ rooms: Object.keys(rooms) });
});

function createBoard() {
  return { columns: { good: [], bad: [], action: [] } };
}

io.use((socket, next) => {
  const { roomId, password, username } = socket.handshake.auth;
  if (!roomId || !password || !username) {
    return next(new Error('Authentication error'));
  }
  if (!rooms[roomId]) {
    rooms[roomId] = {
      password,
      board: createBoard(),
      votesByUser: {}
    };
    saveRooms();
  }
  if (rooms[roomId].password !== password) {
    return next(new Error('Invalid room or password'));
  }
  socket.roomId = roomId;
  socket.username = username;
  next();
});

io.on('connection', socket => {
  const { roomId, username } = socket;
  socket.join(roomId);
  socket.emit('init', rooms[roomId].board);

  socket.on('addCard', ({ column, card }) => {
    const newCard = {
      id: card.id,
      text: card.text,
      votes: 0,
      author: username
    };
    rooms[roomId].board.columns[column].push(newCard);
    saveRooms();
    io.to(roomId).emit('cardAdded', { column, card: newCard });
  });

  socket.on('voteCard', ({ column, cardId }) => {
    const room = rooms[roomId];
    const used = room.votesByUser[username] || 0;
    if (used >= 3) {
      socket.emit('voteDenied');
      return;
    }
    const card = room.board.columns[column].find(c => c.id === cardId);
    if (!card) return;
    card.votes++;
    room.votesByUser[username] = used + 1;
    saveRooms();
    io.to(roomId).emit('cardVoted', { column, cardId, votes: card.votes });
  });

  socket.on('moveCard', ({ cardId, fromColumn, toColumn, newIndex }) => {
    const from = rooms[roomId].board.columns[fromColumn];
    const idx = from.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [card] = from.splice(idx, 1);
    rooms[roomId].board.columns[toColumn].splice(newIndex, 0, card);
    saveRooms();
    io.to(roomId).emit('cardMoved', { cardId, fromColumn, toColumn, newIndex });
  });
});

const PORT = process.env.PORT || 3100;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
