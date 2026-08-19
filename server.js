const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const { imageToCsv } = require("./characters/image_to_character");
const multer = require("multer");
const os = require("os");




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
    const htmlPath = path.join(__dirname, 'public/screen/index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const config = {
        siteBaseUrl: process.env.SITE_BASE_URL || `http://${req.get('host')}`,
        devMode: process.env.NODE_ENV !== 'production'
    };

    const configScript = `<script>window.__CONFIG__ = ${JSON.stringify(config)};</script>`;

    // injiser rett før </head> (eller før hovedscriptet ditt)
    html = html.replace('</head>', `${configScript}</head>`);

    res.send(html);
});


// Design API
const upload = multer({
    dest: path.join(os.tmpdir(), "rawrheaven")
});

app.post("/api/design/convert", upload.array("images"), async (req, res) => {
    try {
        const files = req.files;
        const folderName = req.body.folderName;

        // multer gives a single string if there's only one field value,
        // or an array if there are several — normalize to an array.
        const fileNames = Array.isArray(req.body.fileNames)
            ? req.body.fileNames
            : [req.body.fileNames];

        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No images provided." });
        }

        if (!folderName) {
            return res.status(400).json({ error: "Folder name is required." });
        }

        const paths = [];

        for (let i = 0; i < files.length; i++) {
            const image = files[i].path;
            const fileName = fileNames[i];

            const outputPath = await imageToCsv(
                image,
                folderName,
                fileName
            );

            paths.push(outputPath);
        }

        res.json({ paths });

    } catch (error) {
        res.status(500).json({ error: error.message || "Conversion failed" });
    }
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

    socket.on('player-state', ({ targetId, stamina, lives, maxStamina, maxLives }) => {
        //console.log(`Mottok player-state for ${targetId}: stamina=${stamina}, lives=${lives}`);
        io.to(targetId).emit('player-state', { stamina, lives, maxStamina, maxLives });
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