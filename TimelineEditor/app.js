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
const addMarkerButton = document.getElementById('addMarkerButton');
const saveMarkersButton = document.getElementById('saveMarkersButton');
const loadMarkersButton = document.getElementById('loadMarkersButton');
const clearMarkersButton = document.getElementById('clearMarkersButton');

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

addMarkerButton.addEventListener('click', () => {
    timeline.addMarker(timeline.playhead.time);
});

saveMarkersButton.addEventListener('click', () => {
    const markersData = timeline.exportMarkers();
    localStorage.setItem('timelineMarkers', JSON.stringify(markersData));
});

loadMarkersButton.addEventListener('click', () => {
    const savedMarkers = localStorage.getItem('timelineMarkers');
    timeline.importMarkers(JSON.parse(savedMarkers));
});

clearMarkersButton.addEventListener('click', () => {
    timeline.clearMarkers();
});

timeline.addEventListener('playheadTimeChange', (data) => {
    const valueDisplay = document.getElementById('playheadValue');
    valueDisplay.textContent = `Time: ${data.time.toFixed(2)}s, Value: ${data.value.toFixed(2)}%`;
});