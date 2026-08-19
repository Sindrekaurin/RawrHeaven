const fs = require('fs');
const path = require('path');

const MAPS_DIR = __dirname;
const TILE_SIZE = 40; // piksler per rutenett-celle i spillverdenen
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'screen', 'maps');


// --- CSV-parsing (enkel, ingen eksterne avhengigheter) ---
function parseCsv(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    return raw.split('\n').map(line => line.trim().split(',').map(v => v.trim()));
}

function parsePalette(filePath) {
    const rows = parseCsv(filePath);
    const header = rows[0]; // index,type,color
    const palette = {};

    rows.slice(1).forEach(row => {
        const [index, type, color] = row;
        palette[index] = { type, color };
    });

    return palette;
}

function parseGrid(filePath) {
    const rows = parseCsv(filePath);
    const width = rows[0].length;

    rows.forEach((row, i) => {
        if (row.length !== width) {
            throw new Error(`tiles.csv: rad ${i + 1} har ${row.length} kolonner, forventet ${width}`);
        }
    });

    return rows;
}

// --- Slå sammen tilstøtende tiles av samme type til færre, større rektangler ---
// Grådig algoritme: for hver umerkede celle, voks først horisontalt så langt som mulig,
// deretter voks vertikalt så lenge hele bredden matcher.
function mergeTiles(grid, targetType, palette) {
    const rows = grid.length;
    const cols = grid[0].length;
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const rects = [];

    const typeAt = (r, c) => {
        const entry = palette[grid[r][c]];
        return entry ? entry.type : 'empty';
    };

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (visited[r][c]) continue;
            if (typeAt(r, c) !== targetType) continue;

            // Voks horisontalt
            let width = 1;
            while (
                c + width < cols &&
                !visited[r][c + width] &&
                typeAt(r, c + width) === targetType
            ) {
                width++;
            }

            // Voks vertikalt så lenge hele bredden fortsatt matcher
            let height = 1;
            outer:
            while (r + height < rows) {
                for (let k = 0; k < width; k++) {
                    if (visited[r + height][c + k] || typeAt(r + height, c + k) !== targetType) {
                        break outer;
                    }
                }
                height++;
            }

            // Merk alle celler i rektangelet som besøkt
            for (let rr = 0; rr < height; rr++) {
                for (let cc = 0; cc < width; cc++) {
                    visited[r + rr][c + cc] = true;
                }
            }

            rects.push({ col: c, row: r, width, height });
        }
    }

    return rects;
}

function rectToPixels(rect, color, type) {
    return {
        x: (rect.col + rect.width / 2) * TILE_SIZE,
        y: (rect.row + rect.height / 2) * TILE_SIZE,
        width: rect.width * TILE_SIZE,
        height: rect.height * TILE_SIZE,
        color,
        type
    };
}

// --- Finn alle unike tile-typer som faktisk brukes i paletten (unntatt "empty" og "spawn") ---
function getCollidableTypes(palette) {
    const types = new Set();
    Object.values(palette).forEach(({ type }) => {
        if (type !== 'empty' && type !== 'spawn') types.add(type);
    });
    return [...types];
}

function getColorForType(palette, targetType) {
    const entry = Object.values(palette).find(p => p.type === targetType);
    return entry ? entry.color : '#333344';
}

// --- Finn spawn-punkter (hver spawn-tile blir ett punkt, ikke sammenslått) ---
function findSpawnPoints(grid, palette) {
    const points = [];
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            const entry = palette[grid[r][c]];
            if (entry && entry.type === 'spawn') {
                points.push({
                    x: (c + 0.5) * TILE_SIZE,
                    y: (r + 0.5) * TILE_SIZE
                });
            }
        }
    }
    return points;
}

// --- Rendre én kart-mappe ---
function renderMap(mapDir) {
    const tilesPath = path.join(mapDir, 'tiles.csv');
    const palettePath = path.join(mapDir, 'tiles-palette.csv');

    if (!fs.existsSync(tilesPath) || !fs.existsSync(palettePath)) {
        return; // ikke en gyldig kart-mappe, hopp over
    }

    const mapName = path.basename(mapDir);
    console.log(`Rendrer kart: ${mapName}`);

    const palette = parsePalette(palettePath);
    const grid = parseGrid(tilesPath);

    const width = grid[0].length * TILE_SIZE;
    const height = grid.length * TILE_SIZE;

    const platforms = [];
    getCollidableTypes(palette).forEach(type => {
        const color = getColorForType(palette, type);
        const rects = mergeTiles(grid, type, palette);
        rects.forEach(rect => platforms.push(rectToPixels(rect, color, type)));
    });

    const spawnPoints = findSpawnPoints(grid, palette);

    const compiled = {
        name: mapName,
        tileSize: TILE_SIZE,
        width,
        height,
        spawnPoints,
        platforms
    };

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const outPath = path.join(OUTPUT_DIR, `${mapName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(compiled, null, 2));

    console.log(`  → ${platforms.length} plattform(er), ${spawnPoints.length} spawn-punkt(er)`);
    console.log(`  → skrevet til ${outPath}`);
}

// --- Finn og rendre alle kart-mapper under /maps ---
function renderAllMaps() {
    const entries = fs.readdirSync(MAPS_DIR, { withFileTypes: true });
    const mapDirs = entries
        .filter(e => e.isDirectory())
        .map(e => path.join(MAPS_DIR, e.name));

    if (mapDirs.length === 0) {
        console.warn('Fant ingen kart-mapper under /maps');
        return;
    }

    mapDirs.forEach(renderMap);
}

renderAllMaps();