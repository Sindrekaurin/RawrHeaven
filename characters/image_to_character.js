const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { parse } = require("csv-parse/sync");

const charactersDir = __dirname;
const palettePath = path.join(charactersDir, "palette.csv");

const targetWidth = 24;
const targetHeight = 32;

function readCsv(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    return parse(content, {
        skip_empty_lines: true,
        trim: true
    });
}

function loadPalette() {
    const rows = readCsv(palettePath);
    const palette = [];

    for (const row of rows) {
        if (row.length < 2) {
            continue;
        }

        const index = Number(row[0].trim());
        const color = row[1].trim();

        if (!Number.isInteger(index)) {
            continue;
        }

        if (color === "transparent") {
            palette.push({
                index,
                r: 0,
                g: 0,
                b: 0,
                a: 0
            });

            continue;
        }

        const match = color.match(
            /^#([0-9a-f]{6})$/i
        );

        if (!match) {
            console.warn(
                `Skipping invalid palette color: ${color}`
            );

            continue;
        }

        const hex = match[1];

        palette.push({
            index,
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16),
            a: 255
        });
    }

    return palette;
}

function findNearestPaletteColor(r, g, b, a, palette) {
    if (a < 128) {
        const transparent = palette.find(
            color => color.a === 0
        );

        if (transparent) {
            return transparent.index;
        }
    }

    let bestIndex = 0;
    let bestDistance = Infinity;

    for (const color of palette) {
        if (color.a === 0) {
            continue;
        }

        const red = r - color.r;
        const green = g - color.g;
        const blue = b - color.b;

        const distance =
            red * red +
            green * green +
            blue * blue;

        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = color.index;
        }
    }

    return bestIndex;
}

async function imageToCsv(imagePath, characterName, csvName) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(
            `Image not found: ${imagePath}`
        );
    }

    if (!fs.existsSync(palettePath)) {
        throw new Error(
            `Palette not found: ${palettePath}`
        );
    }

    const palette = loadPalette();

    if (palette.length === 0) {
        throw new Error("Palette is empty");
    }

    console.log(`Loading image: ${imagePath}`);
    console.log(`Loading palette...`);
    console.log(`Loaded ${palette.length} palette entries`);

    const image = await loadImage(imagePath);

    console.log(
        `Source image: ${image.width}x${image.height}`
    );

    const canvas = createCanvas(
        targetWidth,
        targetHeight
    );

    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(
        0,
        0,
        targetWidth,
        targetHeight
    );

    ctx.drawImage(
        image,
        0,
        0,
        image.width,
        image.height,
        0,
        0,
        targetWidth,
        targetHeight
    );

    const imageData = ctx.getImageData(
        0,
        0,
        targetWidth,
        targetHeight
    );

    const rows = [];

    for (let y = 0; y < targetHeight; y++) {
        const row = [];

        for (let x = 0; x < targetWidth; x++) {
            const offset =
                (y * targetWidth + x) * 4;

            const r = imageData.data[offset];
            const g = imageData.data[offset + 1];
            const b = imageData.data[offset + 2];
            const a = imageData.data[offset + 3];

            const paletteIndex =
                findNearestPaletteColor(
                    r,
                    g,
                    b,
                    a,
                    palette
                );

            row.push(paletteIndex);
        }

        rows.push(row.join(","));
    }

    const characterDir = path.join(
        charactersDir,
        characterName
    );

    fs.mkdirSync(characterDir, {
        recursive: true
    });

    const csvPath = path.join(
        characterDir,
        `${csvName}.csv`
    );

    fs.writeFileSync(
        csvPath,
        rows.join("\n") + "\n",
        "utf8"
    );

    console.log(`Created: ${csvPath}`);
    console.log(
        `Grid: ${targetWidth}x${targetHeight}`
    );
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length !== 3) {
        console.log(
            "Usage: node image_to_character.js <image> <character> <csv>"
        );

        console.log(
            "Example: node image_to_character.js knight.png knight attack_a_01"
        );

        process.exit(1);
    }

    const imagePath = path.resolve(args[0]);
    const characterName = args[1];
    const csvName = args[2];

    await imageToCsv(
        imagePath,
        characterName,
        csvName
    );
}


module.exports = {
    imageToCsv
};