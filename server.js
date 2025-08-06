const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API для списка комнат
app.get('/rooms', (req, res) => {
  res.json({ rooms: Object.keys(rooms) });
});

const rooms = {};
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
    io.to(roomId).emit('cardAdded', { column, card: newCard });
  });

  socket.on('voteCard', ({ column, cardId }) => {
    const room = rooms[roomId];
    const used = room.votesByUser[username] || 0;
    if (used >= 3) {
      socket.emit('voteDenied');
      return;
    }
    const cards = room.board.columns[column];
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    card.votes++;
    room.votesByUser[username] = used + 1;
    io.to(roomId).emit('cardVoted', { column, cardId, votes: card.votes });
  });

  socket.on('moveCard', ({ cardId, fromColumn, toColumn, newIndex }) => {
    const from = rooms[roomId].board.columns[fromColumn];
    const idx = from.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [card] = from.splice(idx, 1);
    rooms[roomId].board.columns[toColumn].splice(newIndex, 0, card);
    io.to(roomId).emit('cardMoved', { cardId, fromColumn, toColumn, newIndex });
  });
});

const PORT = process.env.PORT || 3100;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
