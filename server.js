const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- Ruter ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/join', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/join/index.html'));
});

app.get('/join/:gameId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/join/index.html'));
});

app.get('/controller/:gameId/:username', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/controller/index.html'));
});

app.get('/screen/:gameId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/screen/index.html'));
});

// Enkel registrering: gameId -> { socketId: username }
const gameRooms = {};


io.on('connection', (socket) => {
    socket.on('join', ({ gameId, username }) => {
      console.log('JOIN MOTTATT:', gameId, username); // ← legg til denne
      socket.data.gameId = gameId;
      socket.data.username = username;
      socket.join(gameId);

      if (!gameRooms[gameId]) gameRooms[gameId] = {};
      gameRooms[gameId][socket.id] = username;
      console.log('SENDER player-joined til rom:', gameId, '| mottakere:', io.sockets.adapter.rooms.get(gameId)?.size);
      io.to(gameId).emit('player-joined', { id: socket.id, username });
  });

    socket.on('join-screen', ({ gameId }) => {
        socket.data.gameId = gameId;
        socket.join(gameId);

        // Send eksisterende spillere til skjermen (viktig ved refresh)
        const existing = gameRooms[gameId] || {};
        socket.emit('existing-players', existing);
    });

    socket.on('joystick', (data) => {
        socket.to(socket.data.gameId).emit('joystick', { id: socket.id, ...data });
    });

    socket.on('button', (data) => {
        socket.to(socket.data.gameId).emit('button', { id: socket.id, ...data });
    });

    socket.on('disconnect', () => {
        const { gameId, username } = socket.data;
        if (gameId && gameRooms[gameId]) {
            delete gameRooms[gameId][socket.id];
            io.to(gameId).emit('player-left', { id: socket.id, username });
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server kjører på http://localhost:${PORT}`);
});