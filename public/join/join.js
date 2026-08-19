// Forhåndsutfyll gameId hvis den ligger i URL-en (fra QR-kode: /join/{gameId})
const pathParts = window.location.pathname.split('/').filter(Boolean);
const prefilledGameId = pathParts[1];

const gameIdInput = document.getElementById('gameid-input');
const usernameInput = document.getElementById('username-input');

if (prefilledGameId) {
    gameIdInput.value = prefilledGameId;
}

document.getElementById('btn-join').addEventListener('click', () => {
    const gameId = gameIdInput.value.trim();
    const username = usernameInput.value.trim();

    if (!gameId || !username) {
        alert('Fyll ut både spill-ID og brukernavn');
        return;
    }

    console.log(`Bli med i spill ${gameId} som ${username}`);

    window.location.href = `/controller/${encodeURIComponent(gameId.toLowerCase())}/${encodeURIComponent(username)}`;
});