const loginContainer = document.getElementById('login-container');
const boardContainer = document.getElementById('board-container');
let socket;
let elapsed = 0;
let timerInterval;

document.getElementById('login-form').addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const roomId   = document.getElementById('roomId').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !roomId || !password) return;

  socket = io({ auth: { roomId, password, username } });

  socket.on('connect_error', err => {
    alert(err.message);
    socket.disconnect();
  });

  socket.on('connect', () => {
    document.getElementById('room-name').textContent = roomId;

    loginContainer.style.display = 'none';
    boardContainer.style.display = 'block';
    initBoard();
  });
});

function initBoard() {
  // Drag & drop
  document.querySelectorAll('.cards').forEach(container => {
    new Sortable(container, {
      group: 'shared',
      animation: 150,
      onEnd: evt => {
        socket.emit('moveCard', {
          cardId: evt.item.dataset.id,
          fromColumn: evt.from.dataset.column,
          toColumn: evt.to.dataset.column,
          newIndex: evt.newIndex
        });
      }
    });
  });

  // Add card
  document.querySelectorAll('.add').forEach(btn => {
    btn.addEventListener('click', () => {
      const column = btn.closest('.column').dataset.column;
      const text = prompt('Введите текст карточки:');
      if (text) {
        const card = { id: Date.now().toString(), text };
        socket.emit('addCard', { column, card });
      }
    });
  });

  // Timer controls
  document.getElementById('start').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsed++;
      const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const sec = String(elapsed % 60).padStart(2, '0');
      document.getElementById('time').textContent = `${min}:${sec}`;
    }, 1000);
  });
  document.getElementById('pause').addEventListener('click', () => {
    clearInterval(timerInterval);
  });
  document.getElementById('reset').addEventListener('click', () => {
    clearInterval(timerInterval);
    elapsed = 0;
    document.getElementById('time').textContent = '00:00';
  });

  // Socket events
  socket.on('init', board => {
    authors.clear();
    // рендерим карточки из board
    Object.entries(board.columns).forEach(([col, cards]) => {
      const c = document.querySelector(`.cards[data-column="${col}"]`);
      c.innerHTML = '';
      cards.forEach(card => {
        // собираем авторов
        authors.add(card.author);
        renderCard(col, card);
      });
    });
    // после первого рендеринга — отрисуем список
    updateUserList();
  });

  socket.on('cardAdded', ({ column, card }) => renderCard(column, card));
  socket.on('cardVoted', ({ column, cardId, votes }) => {
    const el = document.querySelector(`.card[data-id="${cardId}"] .votes`);
    if (el) el.textContent = votes;
  });

  socket.on('voteDenied', () => {
    alert('Вы использовали все 3 голоса');
  });

  socket.on('cardMoved', ({ cardId, fromColumn, toColumn, newIndex }) => {
    const fromEl = document.querySelector(`.cards[data-column="${fromColumn}"] .card[data-id="${cardId}"]`);
    const toContainer = document.querySelector(`.cards[data-column="${toColumn}"]`);
    if (fromEl && toContainer) {
      toContainer.insertBefore(fromEl, toContainer.children[newIndex] || null);
    }
  });
}

function stringToColor(str) {
  // простой хеш UTF-16 кодов в число
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // получаем hue 0–360°
  const hue = Math.abs(hash) % 360;
  // возвращаем бледный HSL
  return `hsl(${hue}, 70%, 90%)`;
}
// Множество для всех авторов
const authors = new Set();
// Текущий выбранный автор (или null)
let selectedAuthor = null;

// Вызываем при загрузке доски и при добавлении новой карточки
function updateUserList() {
  const container = document.getElementById('user-list');
  container.innerHTML = '';
  authors.forEach(name => {
    const btn = document.createElement('div');
    btn.className = 'user-item' + (selectedAuthor === name ? ' selected' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      // Тогглим выбор
      selectedAuthor = selectedAuthor === name ? null : name;
      updateUserList();
      updateCardHighlight();
    });
    container.appendChild(btn);
  });
}

// Проставляем классы highlight/dim для всех карточек
function updateCardHighlight() {
  document.querySelectorAll('.card').forEach(cardEl => {
    const author = cardEl.dataset.author;
    cardEl.classList.remove('highlight', 'dim');
    if (selectedAuthor) {
      if (author === selectedAuthor) {
        cardEl.classList.add('highlight');
      } else {
        cardEl.classList.add('dim');
      }
    }
  });
}

function renderCard(column, card) {
  const container = document.querySelector(`.cards[data-column="${column}"]`);
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;
  el.dataset.author = card.author;             // ← добавляем сюда
  el.style.backgroundColor = stringToColor(card.author);

  el.innerHTML = `
    <div class="text">${card.text}</div>
    <div class="author">— ${card.author}</div>
    <span class="votes">${card.votes}</span>
  `;
  el.addEventListener('click', () => {
    socket.emit('voteCard', { column, cardId: card.id });
  });
  container.appendChild(el);

  // при рисовании новой карточки — обновляем список авторов и состояние фильтра
  authors.add(card.author);
  updateUserList();
  updateCardHighlight();
}

// Загрузка и отображение списка комнат
fetch('/rooms')
  .then(res => res.json())
  .then(data => {
    const ul = document.getElementById('rooms');
    if (!ul) return;
    const rooms = data.rooms;
    if (rooms.length === 0) {
      ul.innerHTML = '<li>Пока нет комнат</li>';
    } else {
      rooms.forEach(id => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = id;
        btn.addEventListener('click', () => {
          document.getElementById('roomId').value = id;
        });
        li.appendChild(btn);
        ul.appendChild(li);
      });
    }
  });