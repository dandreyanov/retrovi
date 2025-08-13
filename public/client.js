const loginContainer = document.getElementById('login-container');
const boardContainer = document.getElementById('board-container');
let socket;
let elapsed = 0;
let timerInterval;

// список для равномерного распределения hue
const authorsList = [];
// множество для списка пользователей
const authors = new Set();
// текущий отфильтрованный автор
let selectedAuthor = null;

// ---- тема ----
const themeToggle = document.getElementById('theme-toggle');
function applyTheme(theme) {
  document.body.classList.toggle('dark-theme', theme === 'dark');
  themeToggle.textContent = theme === 'dark' ? '☀️ Светлая' : '🌙 Тёмная';
}
const saved = localStorage.getItem('theme') || 'light';
applyTheme(saved);
themeToggle.addEventListener('click', () => {
  const current = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
});
// ---- /тема ----

function animateCard(el, className) {
  el.classList.add(className);
  el.addEventListener('animationend', () => {
    el.classList.remove(className);
  }, { once: true });
}

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
  // при новой инициализации очищаем списки авторов
  authors.clear();
  authorsList.length = 0;

  // Drag & drop
  document.querySelectorAll('.cards').forEach(container => {
    new Sortable(container, {
      group: 'shared', animation: 150,
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
    // очищаем визуально доску и собираем авторов
    Object.entries(board.columns).forEach(([col, cards]) => {
      const c = document.querySelector(`.cards[data-column="${col}"]`);
      c.innerHTML = '';
      cards.forEach(card => renderCard(col, card));
    });
    updateUserList();
    
    // Обновляем значки для всех карточек после инициализации
    updateMedals();
  });

  socket.on('cardAdded', ({ column, card }) => {
    renderCard(column, card);
    // найдем только что добавленную карточку и анимируем
    const el = document.querySelector(`.card[data-id="${card.id}"]`);
    if (el) animateCard(el, 'fade-in');
  });

  socket.on('cardVoted', ({ column, cardId, votes }) => {
    const el = document.querySelector(`.card[data-id="${cardId}"]`);
    if (el) {
      // обновляем счетчик
      el.querySelector('.votes').textContent = votes;
      // даем «вспышку»
      animateCard(el, 'vote-flash');
    }
    // Обновляем значки после изменения голосов
    updateMedals();
  });
  socket.on('voteDenied', () => {
    alert('Вы использовали все 3 голоса');
  });

  socket.on('cardMoved', ({ cardId, fromColumn, toColumn, newIndex }) => {
    const fromEl = document.querySelector(
        `.cards[data-column="${fromColumn}"] .card[data-id="${cardId}"]`
    );
    const toContainer = document.querySelector(`.cards[data-column="${toColumn}"]`);
    if (fromEl && toContainer) {
      toContainer.insertBefore(fromEl, toContainer.children[newIndex] || null);
    }
    // Обновляем значки после перемещения карточки
    updateMedals();
  });
}

/**
 * Генерирует для каждого автора цвет,
 * распределяя hue через золотой угол (≈137.5°)
 * @param {string} author — имя автора
 * @returns {string} hsl-цвет
 */
function stringToColor(author) {
  // если автора ещё нет в списке — добавляем
  if (!authorsList.includes(author)) {
    authorsList.push(author);
  }
  const index = authorsList.indexOf(author);
  const goldenAngle = 137.508;                   // «золотой угол»
  const hue = (index * goldenAngle) % 360;       // разброс по кругу
  const saturation = 60;                         // чуть меньше насыщенности
  const lightness = 85;                          // светлее для контраста
  return `hsl(${hue.toFixed(2)}, ${saturation}%, ${lightness}%)`;
}

function updateUserList() {
  const container = document.getElementById('user-list');
  container.innerHTML = '';
  authors.forEach(name => {
    const btn = document.createElement('div');
    btn.className = 'user-item' + (selectedAuthor === name ? ' selected' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      selectedAuthor = selectedAuthor === name ? null : name;
      updateUserList();
      updateCardHighlight();
    });
    container.appendChild(btn);
  });
}

function updateCardHighlight() {
  document.querySelectorAll('.card').forEach(cardEl => {
    const author = cardEl.dataset.author;
    cardEl.classList.remove('highlight', 'dim');
    if (selectedAuthor) {
      cardEl.classList.toggle('highlight', author === selectedAuthor);
      cardEl.classList.toggle('dim', author !== selectedAuthor);
    }
  });
}

/**
 * Определяет позицию карточки по общему количеству голосов во всех колонках
 * @param {string} cardId - ID карточки
 * @returns {number|null} - позиция (1, 2, 3) или null если не в топ-3
 */
function getCardPosition(cardId) {
  // Получаем все карточки из всех колонок
  const allCards = [];
  ['good', 'bad', 'action'].forEach(column => {
    const container = document.querySelector(`.cards[data-column="${column}"]`);
    if (container) {
      container.querySelectorAll('.card').forEach(cardEl => {
        allCards.push({
          id: cardEl.dataset.id,
          votes: parseInt(cardEl.querySelector('.votes').textContent) || 0
        });
      });
    }
  });
  
  // Сортируем все карточки по голосам
  allCards.sort((a, b) => b.votes - a.votes);
  
  // Находим позицию карточки
  const position = allCards.findIndex(card => card.id === cardId) + 1;
  return position <= 3 ? position : null;
}

/**
 * Обновляет значки для всех карточек во всех колонках
 */
function updateMedals() {
  // Обновляем значки для всех карточек во всех колонках
  ['good', 'bad', 'action'].forEach(column => {
    const container = document.querySelector(`.cards[data-column="${column}"]`);
    if (!container) return;
    
    container.querySelectorAll('.card').forEach(cardEl => {
      const cardId = cardEl.dataset.id;
      const position = getCardPosition(cardId);
      
      // Удаляем существующие значки
      const existingMedal = cardEl.querySelector('.medal');
      if (existingMedal) {
        existingMedal.remove();
      }
      
      // Добавляем новый значок если карточка в топ-3
      if (position) {
        const medal = document.createElement('div');
        medal.className = 'medal';
        
        if (position === 1) {
          medal.className += ' gold';
          medal.textContent = '🥇';
        } else if (position === 2) {
          medal.className += ' silver';
          medal.textContent = '🥈';
        } else if (position === 3) {
          medal.className += ' bronze';
          medal.textContent = '🥉';
        }
        
        cardEl.appendChild(medal);
      }
    });
  });
}

function renderCard(column, card) {
  const container = document.querySelector(`.cards[data-column="${column}"]`);
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;
  el.dataset.author = card.author;
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

  // собираем автора в множество и обновляем список
  authors.add(card.author);
  updateUserList();
  updateCardHighlight();
  
  // Обновляем значки для всех карточек
  updateMedals();
}

// список комнат
fetch('/rooms')
    .then(res => res.json())
    .then(data => {
      const ul = document.getElementById('rooms');
      if (!ul) return;
      if (data.rooms.length === 0) {
        ul.innerHTML = '<li>Пока нет комнат</li>';
      } else {
        data.rooms.forEach(id => {
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
