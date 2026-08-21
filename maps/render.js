const fs = require('fs');
const path = require('path');

const MAPS_DIR = __dirname;
const TILE_SIZE = 40;
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'screen', 'maps');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];


// --- Finn første fil med en av de angitte filtypene ---
function findFirstFile(directory, extensions) {
    const files = fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .filter(file => extensions.includes(path.extname(file).toLowerCase()))
        .sort();

    return files.length > 0 ? files[0] : null;
}


// --- Kopier kartressurs ---
function copyMapResource(mapDir, outputDir, sourceFile, outputName) {
    if (!sourceFile) return null;

    const sourcePath = path.join(mapDir, sourceFile);
    const extension = path.extname(sourceFile).toLowerCase();
    const outputFile = `${outputName}${extension}`;
    const outputPath = path.join(outputDir, outputFile);

    fs.copyFileSync(sourcePath, outputPath);

    return outputFile;
}


// --- CSV-parsing ---
function parseCsv(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    return raw.split('\n').map(line => line.trim().split(',').map(v => v.trim()));
}


function parsePalette(filePath) {
    const rows = parseCsv(filePath);
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
            throw new Error(
                `tiles.csv: rad ${i + 1} har ${row.length} kolonner, forventet ${width}`
            );
        }
    });

    return rows;
}


// --- Slå sammen tilstøtende tiles ---
function mergeTiles(grid, targetType, palette) {
    const rows = grid.length;
    const cols = grid[0].length;
    const visited = Array.from(
        { length: rows },
        () => new Array(cols).fill(false)
    );

    const rects = [];

    const typeAt = (r, c) => {
        const entry = palette[grid[r][c]];
        return entry ? entry.type : 'empty';
    };

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (visited[r][c]) continue;
            if (typeAt(r, c) !== targetType) continue;

            let width = 1;

            while (
                c + width < cols &&
                !visited[r][c + width] &&
                typeAt(r, c + width) === targetType
            ) {
                width++;
            }

            let height = 1;

            outer:
            while (r + height < rows) {
                for (let k = 0; k < width; k++) {
                    if (
                        visited[r + height][c + k] ||
                        typeAt(r + height, c + k) !== targetType
                    ) {
                        break outer;
                    }
                }

                height++;
            }

            for (let rr = 0; rr < height; rr++) {
                for (let cc = 0; cc < width; cc++) {
                    visited[r + rr][c + cc] = true;
                }
            }

            rects.push({
                col: c,
                row: r,
                width,
                height
            });
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


function getCollidableTypes(palette) {
    const types = new Set();

    Object.values(palette).forEach(({ type }) => {
        if (type !== 'empty' && type !== 'spawn') {
            types.add(type);
        }
    });

    return [...types];
}


function getColorForType(palette, targetType) {
    const entry = Object.values(palette)
        .find(p => p.type === targetType);

    return entry ? entry.color : '#333344';
}


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


// --- Rendre ett kart ---
function renderMap(mapDir) {
    const tilesPath = path.join(mapDir, 'tiles.csv');
    const palettePath = path.join(mapDir, 'tiles-palette.csv');

    if (!fs.existsSync(tilesPath) || !fs.existsSync(palettePath)) {
        return;
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

        rects.forEach(rect => {
            platforms.push(
                rectToPixels(rect, color, type)
            );
        });
    });

    const spawnPoints = findSpawnPoints(grid, palette);

    // --- Finn kartressurser ---
    const backgroundSource = findFirstFile(
        mapDir,
        IMAGE_EXTENSIONS
    );

    const musicSource = findFirstFile(
        mapDir,
        AUDIO_EXTENSIONS
    );

    // --- Opprett output-mappe ---
    const mapOutputDir = path.join(
        OUTPUT_DIR,
        mapName
    );

    if (!fs.existsSync(mapOutputDir)) {
        fs.mkdirSync(mapOutputDir, { recursive: true });
    }

    // --- Kopier ressurser ---
    const background = copyMapResource(
        mapDir,
        mapOutputDir,
        backgroundSource,
        'background'
    );

    const music = copyMapResource(
        mapDir,
        mapOutputDir,
        musicSource,
        'music'
    );

    const compiled = {
        name: mapName,
        tileSize: TILE_SIZE,
        width,
        height,
        background,
        music,
        spawnPoints,
        platforms
    };

    const outPath = path.join(
        OUTPUT_DIR,
        `${mapName}.json`
    );

    fs.writeFileSync(
        outPath,
        JSON.stringify(compiled, null, 2)
    );

    console.log(
        `  → ${platforms.length} plattform(er), ${spawnPoints.length} spawn-punkt(er)`
    );

    console.log(
        `  → background: ${background || 'ingen'}`
    );

    console.log(
        `  → music: ${music || 'ingen'}`
    );

    console.log(
        `  → skrevet til ${outPath}`
    );
}


// --- Finn alle kart ---
function renderAllMaps() {
    const entries = fs.readdirSync(
        MAPS_DIR,
        { withFileTypes: true }
    );

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