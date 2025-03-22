// Initialize timeline
const timeline = new TimelineEditor('timelineCanvas');

// Set responsive canvas size
function resizeCanvas() {
    const canvas = document.getElementById('timelineCanvas');
    const width = Math.max(800, window.innerWidth - 40); // Remove margins, use full window width
    canvas.width = width;
    canvas.style.width = width + 'px';
    timeline.draw();
}

// Initial size setup
resizeCanvas();

// Listen for window resize
window.addEventListener('resize', resizeCanvas);

// When document is loaded
document.addEventListener('DOMContentLoaded', () => {
    timeline.seek(5);
});

// Setup button event listeners
const saveButton = document.getElementById('saveButton');
const loadButton = document.getElementById('loadButton');
const undoButton = document.getElementById('undoButton');
const playButton = document.getElementById('playButton');
const stopButton = document.getElementById('stopButton');

saveButton.addEventListener('click', () => {
    const data = timeline.exportData();
    localStorage.setItem('timelineData', JSON.stringify(data));
});

loadButton.addEventListener('click', () => {
    const savedData = localStorage.getItem('timelineData');
    timeline.importData(JSON.parse(savedData));
});

undoButton.addEventListener('click', () => timeline.undo());

playButton.addEventListener('click', () => {
    if (timeline.playhead.isPlaying) {
        timeline.pause();
    } else {
        timeline.play();
    }
});
stopButton.addEventListener('click', () => {
    if (timeline.playhead.isPlaying) {
        timeline.pause();
    } else {
        timeline.seek(0);
    }
});

// Add Timeline event listener
timeline.addEventListener('playheadTimeChange', (data) => {
    const valueDisplay = document.getElementById('playheadValue');
    valueDisplay.textContent = `Time: ${data.time.toFixed(2)}s, Value: ${data.value.toFixed(2)}%`;
});