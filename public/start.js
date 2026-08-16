function generateGameId() {
    return Math.random().toString(36).substring(2, 7); // f.eks. "a3f9k"
}

document.getElementById('btn-screen').addEventListener('click', () => {
    const gameId = generateGameId();
    window.location.href = `/screen/${gameId}`;
});

document.getElementById('btn-controller').addEventListener('click', () => {
    window.location.href = `/join`;
});