const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");
const { parse } = require("csv-parse/sync");

const charactersDir = __dirname;
const palettePath = path.join(charactersDir, "palette.csv");
const outputDir = path.join(__dirname, "..", "public", "screen", "sprites");

const outputSize = 128;

function readCsv(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    return parse(content, {
        skip_empty_lines: true,
        trim: true
    });
}

function loadPalette() {
    const rows = readCsv(palettePath);
    const palette = {};

    for (const row of rows) {
        if (row.length < 2) {
            continue;
        }

        const index = row[0].trim();
        const color = row[1].trim();

        palette[index] = color;
    }

    return palette;
}

function renderFrame(csvPath, palette) {
    const grid = readCsv(csvPath);

    if (grid.length === 0) {
        throw new Error(`Empty CSV: ${csvPath}`);
    }

    const height = grid.length;
    const width = grid[0].length;

    for (const row of grid) {
        if (row.length !== width) {
            throw new Error(`Inconsistent row width in ${csvPath}`);
        }
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const value = String(grid[y][x]).trim();
            const color = palette[value];

            if (color === undefined) {
                throw new Error(
                    `Unknown palette index "${value}" in ${csvPath}`
                );
            }

            if (color === "transparent") {
                continue;
            }

            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    const scaledCanvas = createCanvas(outputSize, outputSize);
    const scaledCtx = scaledCanvas.getContext("2d");

    scaledCtx.imageSmoothingEnabled = false;

    scaledCtx.drawImage(
        canvas,
        0,
        0,
        width,
        height,
        0,
        0,
        outputSize,
        outputSize
    );

    return scaledCanvas;
}

function createSpritesheet(frames) {
    const width = frames.length * outputSize;
    const height = outputSize;

    const spritesheet = createCanvas(width, height);
    const ctx = spritesheet.getContext("2d");

    ctx.imageSmoothingEnabled = false;

    frames.forEach((frame, index) => {
        ctx.drawImage(
            frame.canvas,
            index * outputSize,
            0
        );
    });

    return spritesheet;
}

function createAtlas(frames) {
    const atlas = {
        frames: {},
        meta: {
            image: "",
            format: "RGBA8888",
            size: {
                w: frames.length * outputSize,
                h: outputSize
            },
            scale: "1"
        }
    };

    frames.forEach((frame, index) => {
        atlas.frames[frame.name] = {
            frame: {
                x: index * outputSize,
                y: 0,
                w: outputSize,
                h: outputSize
            },
            rotated: false,
            trimmed: false,
            spriteSourceSize: {
                x: 0,
                y: 0,
                w: outputSize,
                h: outputSize
            },
            sourceSize: {
                w: outputSize,
                h: outputSize
            }
        };
    });

    return atlas;
}

function renderCharacter(characterName, characterDir, palette) {
    const csvFiles = fs
        .readdirSync(characterDir)
        .filter(file => file.toLowerCase().endsWith(".csv"))
        .sort((a, b) => a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: "base"
        }));

    if (csvFiles.length === 0) {
        console.log(`Skipping ${characterName}: no CSV files`);
        return;
    }

    console.log(`Rendering ${characterName}`);

    const frames = [];

    for (const file of csvFiles) {
        const csvPath = path.join(characterDir, file);
        const frameName = path.basename(file, ".csv");

        console.log(`  ${frameName}`);

        const canvas = renderFrame(csvPath, palette);

        frames.push({
            name: frameName,
            canvas
        });
    }

    const spritesheet = createSpritesheet(frames);
    const atlas = createAtlas(frames);

    atlas.meta.image = `${characterName}.png`;

    fs.mkdirSync(outputDir, {
        recursive: true
    });

    const pngPath = path.join(
        outputDir,
        `${characterName}.png`
    );

    const jsonPath = path.join(
        outputDir,
        `${characterName}.json`
    );

    fs.writeFileSync(
        pngPath,
        spritesheet.toBuffer("image/png")
    );

    fs.writeFileSync(
        jsonPath,
        JSON.stringify(atlas, null, 2)
    );

    console.log(`  -> ${pngPath}`);
    console.log(`  -> ${jsonPath}`);
}

function main() {
    console.log("Loading palette...");

    if (!fs.existsSync(palettePath)) {
        throw new Error(`Palette not found: ${palettePath}`);
    }

    const palette = loadPalette();

    console.log(`Loaded ${Object.keys(palette).length} palette entries`);

    const entries = fs
        .readdirSync(charactersDir, {
            withFileTypes: true
        })
        .filter(entry => entry.isDirectory());

    if (entries.length === 0) {
        console.log("No character directories found.");
        return;
    }

    for (const entry of entries) {
        const characterName = entry.name;
        const characterDir = path.join(
            charactersDir,
            characterName
        );

        renderCharacter(
            characterName,
            characterDir,
            palette
        );
    }

    console.log("Rendering complete.");
}

try {
    main();
} catch (error) {
    console.error("\nRender failed:");
    console.error(error.message);
    process.exit(1);
}