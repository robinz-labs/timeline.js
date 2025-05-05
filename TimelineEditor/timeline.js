class TimelineEditor {

    static PointType = {
        LINEAR: 0,
        BEZIER: 1
    };

    constructor(canvasId, options = {}) {
        
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Default apperance options
        const defaultOptions = {
            totalDuration: 1800,        // Total duration in seconds
            viewportDuration: 30,       // Current viewport duration in seconds
            minViewportDuration: 10,    // Minimum viewport range in seconds
            maxViewportDuration: 90,    // Maximum viewport range in seconds
            lineColor: '#4CAF50'        // Line color
        };

        // Merge default options with user provided options
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Apply merged options
        this.totalDuration = mergedOptions.totalDuration;
        this.viewportDuration = mergedOptions.viewportDuration;
        this.minViewportDuration = mergedOptions.minViewportDuration;
        this.maxViewportDuration = mergedOptions.maxViewportDuration;
        this.lineColor = mergedOptions.lineColor;
        
        // Margin settings
        this.margin = {
            left: 50,    // Left margin for value scale
            right: 20,   // Right margin
            top: 20,     // Top margin
            bottom: 30   // Bottom margin for time scale
        };

        // Viewport control properties for handling timeline window panning
        this.viewportStart = 0;     // Start time of current viewport in seconds
        this.isDragging = false;    // Flag indicating whether viewport is being dragged
        this.lastX = 0;             // Last mouse X position for drag calculation

        // Initialize markers array and mark click detection
        this.markers = [];
        this.lastMarkerClickTime = 0;
        this.lastClickedMarkerIndex = -1;

        // Default curve control points
        this.points = [
            { time: 0, value: 50, type: TimelineEditor.PointType.LINEAR },
            { time: 30, value: 50, type: TimelineEditor.PointType.LINEAR }  // End point at 30s
        ];
        this.selectedPoint = null;
        this.hoverPoint = null;
        this.pointRadius = 4;

        // Properties for handling double click detection
        this.lastClickTime = 0;        // Timestamp of the last mouse click (used to detect double clicks)
        this.lastClickPoint = null;    // Reference to the last clicked control point (for double click deletion)

        // History management
        this.history = [];
        this.maxHistoryLength = 50;  // Maximum history records
        
        // Playhead properties
        this.playhead = {
            time: 0,             // Current playhead position in seconds
            color: '#FFFFFF',    // Playhead line and indicator color
            width: 1,            // Playhead line width in pixels
            isDragging: false,   // Flag indicating whether playhead is being dragged
            isPlaying: false,    // Flag indicating whether timeline is playing
            timer: null,         // Reference to the playback timer
            fps: 20              // Playback frame rate
        };

        // Save initial state
        this.saveToHistory();        
    
        // Initialize event listeners
        this.setupEventListeners();
    
        // Create Timeline custom event listeners for external callbacks
        this.eventListeners = {
            'playheadTimeChange': []
        };
                
        // Monitor playhead.time changes using Proxy
        this.playhead = new Proxy(this.playhead, {
            set: (target, property, value) => {
                const oldValue = target[property];
                target[property] = value;
                
                if ((property === 'time' && oldValue !== value) ||
                    (property === 'isPlaying' && oldValue !== value)) {
                    this.emit('playheadTimeChange', { 
                        time: target.time, 
                        value: this.getValue(target.time),
                        isPlaying: target.isPlaying 
                    });
                }
                return true;
            }
        });
    }

    // Custom event listener registration method
    addEventListener(eventName, callback) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].push(callback);
        }
    }

    // Custom event listener removal method
    removeEventListener(eventName, callback) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName] = this.eventListeners[eventName]
                .filter(listener => listener !== callback);
        }
    }

    // Custom event emission method
    emit(eventName, data) {
        if (this.eventListeners[eventName]) {
            this.eventListeners[eventName].forEach(callback => callback(data));
        }
    }

    setupEventListeners() {
        // Prevent default context menu
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check control points first
            const point = this.findNearestPoint(x, y);
            if (point) {
                const currentTime = Date.now();
                
                if (currentTime - this.lastClickTime < 300 && point === this.lastClickPoint) {
                    if (point !== this.points[0] && point !== this.points[this.points.length - 1]) {
                        const index = this.points.indexOf(point);
                        this.points.splice(index, 1);
                        this.selectedPoint = null;
                        this.saveToHistory();
                    }
                } else {
                    this.selectedPoint = point;
                    this.isDragging = false;
                }
                
                this.lastClickTime = currentTime;
                this.lastClickPoint = point;
                this.draw();
                return;
            }

            // Then check curve click
            const newPoint = this.checkLineClick(x, y);
            if (newPoint) {
                newPoint.type = e.button === 2 ? TimelineEditor.PointType.BEZIER : TimelineEditor.PointType.LINEAR;
                this.points.push(newPoint);
                this.points.sort((a, b) => a.time - b.time);
                this.selectedPoint = newPoint;
                this.isDragging = false;
                this.saveToHistory();
                this.draw();
                return;
            }

            // Check playhead next
            if (this.isPlayheadClicked(x, y)) {
                this.playhead.isDragging = true;
                return;
            }

            // Check if click is within the chart area
            const isInChartArea = x >= this.margin.left && 
                                x <= this.canvas.width - this.margin.right &&
                                y >= this.margin.top && 
                                y <= this.canvas.height - this.margin.bottom;

            if (isInChartArea) {
                const currentTime = Date.now();
                
                // Check for double click
                if (currentTime - this.lastBackgroundClickTime < 300 &&
                    Math.abs(x - this.lastBackgroundClickX) < 5 &&
                    Math.abs(y - this.lastBackgroundClickY) < 5) {
                    const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
                    const time = this.viewportStart + 
                        (x - this.margin.left) * this.viewportDuration / chartWidth;
                    this.seek(time);
                    return;
                }
                
                this.lastBackgroundClickTime = currentTime;
                this.lastBackgroundClickX = x;
                this.lastBackgroundClickY = y;
            }

            // Check marker
            const markIndex = this.findNearestMark(x, y);
            if (markIndex !== -1) {
                const currentTime = Date.now();
                
                if (currentTime - this.lastMarkerClickTime < 300 && 
                    markIndex === this.lastClickedMarkerIndex) {
                    this.markers.splice(markIndex, 1);
                    this.draw();
                }
                
                this.lastMarkerClickTime = currentTime;
                this.lastClickedMarkerIndex = markIndex;
                return;
            }

            // If no click detected, start viewport dragging
            this.isDragging = true;
            this.lastX = e.clientX;
        });

        document.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Handle playhead dragging
            if (this.playhead.isDragging) {
                const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
                const time = this.viewportStart + 
                    (x - this.margin.left) * this.viewportDuration / chartWidth;
                
                // Ensure playhead stays within valid range
                this.seek(time);
                return;
            }

            if (this.selectedPoint) {
                const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
                const chartHeight = this.canvas.height - this.margin.top - this.margin.bottom;
                
                if (this.selectedPoint === this.points[0]) {
                    // Start point can only move vertically
                    const value = Math.max(0, Math.min(100, 100 * (1 - (y - this.margin.top) / chartHeight)));
                    this.selectedPoint.value = value;
                } else if (this.selectedPoint === this.points[this.points.length - 1]) {
                    // End point can move both horizontally and vertically
                    const time = this.viewportStart + (x - this.margin.left) * this.viewportDuration / chartWidth;
                    const value = Math.max(0, Math.min(100, 100 * (1 - (y - this.margin.top) / chartHeight)));
                    
                    // Ensure end point time is greater than previous point and within total duration
                    const prevTime = this.points[this.points.length - 2].time;
                    this.selectedPoint.time = Math.max(prevTime + 1, Math.min(this.totalDuration, time));
                    this.selectedPoint.value = value;
                } else {
                    // Middle points can move within their neighbors
                    const time = this.viewportStart + (x - this.margin.left) * this.viewportDuration / chartWidth;
                    const value = Math.max(0, Math.min(100, 100 * (1 - (y - this.margin.top) / chartHeight)));
                    
                    // Ensure point stays between its neighbors
                    const index = this.points.indexOf(this.selectedPoint);
                    const prevTime = this.points[index - 1].time;
                    const nextTime = this.points[index + 1].time;
                    
                    this.selectedPoint.time = Math.max(prevTime, Math.min(nextTime, time));
                    this.selectedPoint.value = value;
                }
                this.draw();
            } else if (this.isDragging) {
                // Handle viewport dragging
                const dx = e.clientX - this.lastX;
                const timeChange = (dx / this.canvas.width) * this.viewportDuration;
                this.viewportStart = Math.max(0, Math.min(this.totalDuration - this.viewportDuration,
                    this.viewportStart - timeChange));
                this.lastX = e.clientX;
                this.draw();
            }
        });

        document.addEventListener('mouseup', () => {
            // Reset playhead drag state
            this.playhead.isDragging = false;
            
            if (this.selectedPoint) {  // Save history if control point was being moved
                this.saveToHistory();
            }
            this.isDragging = false;
            this.selectedPoint = null;
        });

        // Mouse wheel event listener for zoom control
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();  // Prevent default scroll behavior
            
            // Calculate time at mouse position
            const mouseX = e.clientX - this.canvas.getBoundingClientRect().left;
            const timeUnderMouse = this.viewportStart + 
                ((mouseX - this.margin.left) / (this.canvas.width - this.margin.left - this.margin.right)) * 
                this.viewportDuration;

            // Adjust viewport range based on wheel direction
            if (e.deltaY > 0) {
                // Scroll up to increase viewport range
                this.viewportDuration = Math.min(this.maxViewportDuration, this.viewportDuration + 5);
            } else {
                // Scroll down to decrease viewport range
                this.viewportDuration = Math.max(this.minViewportDuration, this.viewportDuration - 5);
            }

            // Adjust viewport start to keep mouse-pointed time constant
            this.viewportStart = Math.max(0, Math.min(
                this.totalDuration - this.viewportDuration,
                timeUnderMouse - (mouseX - this.margin.left) / 
                (this.canvas.width - this.margin.left - this.margin.right) * this.viewportDuration
            ));

            this.draw();
        });
    }

    // Check if playhead is clicked within its triangle area
    isPlayheadClicked(x, y) {
        if (this.playhead.time < this.viewportStart || 
            this.playhead.time > this.viewportStart + this.viewportDuration) {
            return false;
        }

        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
        const playheadX = this.margin.left + 
            ((this.playhead.time - this.viewportStart) / this.viewportDuration) * chartWidth;

        // Check only the triangle indicator area
        return x >= playheadX - 5 && x <= playheadX + 5 && 
               y >= this.margin.top - 8 && y <= this.margin.top;
    }

    // Check if time axis area is clicked
    isTimeAxisAreaClicked(x, y) {
        // Check bottom time axis area
        const isBottomArea = y >= this.canvas.height - this.margin.bottom + 5 && 
                           y <= this.canvas.height &&
                           x >= this.margin.left && 
                           x <= this.canvas.width - this.margin.right;
        
        // Check top empty area
        const isTopArea = y >= 0 && 
                         y <= this.margin.top - 5 &&
                         x >= this.margin.left && 
                         x <= this.canvas.width - this.margin.right;
        
        return isBottomArea || isTopArea;
    }

    // Find the nearest control point to the clicked position
    findNearestPoint(x, y) {
        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
        const chartHeight = this.canvas.height - this.margin.top - this.margin.bottom;

        for (const point of this.points) {
            const px = this.margin.left + ((point.time - this.viewportStart) / this.viewportDuration) * chartWidth;
            const py = this.margin.top + (1 - point.value / 100) * chartHeight;
            
            const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            if (distance <= this.pointRadius * 2) {
                return point;
            }
        }
        return null;
    }

    // Find the nearest mark to the clicked position
    findNearestMark(x, y) {
        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
        
        for (let i = 0; i < this.markers.length; i++) {
            const time = this.markers[i];
            if (time >= this.viewportStart && time <= this.viewportStart + this.viewportDuration) {
                const markX = Math.round(this.margin.left + 
                    ((time - this.viewportStart) / this.viewportDuration) * chartWidth);
                
                // Check if click is within 3 pixels of the mark line
                if (Math.abs(x - markX) <= 3 && 
                    y >= this.margin.top && 
                    y <= this.canvas.height - this.margin.bottom) {
                    return i;
                }
            }
        }
        return -1;
    }

    // Check if mouse click is on the curve line
    checkLineClick(x, y) {
        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
        const chartHeight = this.canvas.height - this.margin.top - this.margin.bottom;
        const time = this.viewportStart + (x - this.margin.left) * this.viewportDuration / chartWidth;
        const value = 100 * (1 - (y - this.margin.top) / chartHeight);

        if (time <= 0 || time >= this.totalDuration || value < 0 || value > 100) {
            return null;
        }

        // Check proximity to line segments or curves
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            
            if (time >= p1.time && time <= p2.time) {
                const t = (time - p1.time) / (p2.time - p1.time);
                let expectedValue;
                
                if (p1.type === TimelineEditor.PointType.BEZIER || p2.type === TimelineEditor.PointType.BEZIER) {
                    // Calculate bezier curve value
                    const cp1y = p1.value;
                    const cp2y = p2.value;
                    // Cubic bezier curve calculation
                    expectedValue = p1.value * Math.pow(1-t, 3) + 
                                  cp1y * 3 * t * Math.pow(1-t, 2) + 
                                  cp2y * 3 * Math.pow(t, 2) * (1-t) + 
                                  p2.value * Math.pow(t, 3);
                } else {
                    // Linear interpolation
                    expectedValue = p1.value + (p2.value - p1.value) * t;
                }
                
                if (Math.abs(value - expectedValue) < 5) {
                    return { time, value };
                }
            }
        }
        return null;
    }

    draw() {
        // Set dark background
        this.ctx.fillStyle = '#2d2d2d';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();
        this.drawTimeAxis();
        this.drawValueAxis();
        this.drawMarkers();
        this.drawPolyline();
        this.drawPlayhead();
    }

    drawPolyline() {
        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
        const chartHeight = this.canvas.height - this.margin.top - this.margin.bottom;

        // Draw line segments and curves
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.lineColor;  // Use color property
        this.ctx.lineWidth = 2;

        let isFirstVisiblePoint = true;
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            // Skip segments outside viewport
            if (p2.time < this.viewportStart || p1.time > this.viewportStart + this.viewportDuration) {
                continue;
            }

            // Compute line segments' actual start and end coordinates
            const x1 = this.margin.left + ((p1.time - this.viewportStart) / this.viewportDuration) * chartWidth;
            const y1 = this.margin.top + (1 - p1.value / 100) * chartHeight;
            const x2 = this.margin.left + ((p2.time - this.viewportStart) / this.viewportDuration) * chartWidth;
            const y2 = this.margin.top + (1 - p2.value / 100) * chartHeight;

            // Handle line segment and viewport boundary intersection
            let startX = x1;
            let startY = y1;
            let endX = x2;
            let endY = y2;

            // If start point is on the left of viewport
            if (p1.time < this.viewportStart) {
                const t = (this.viewportStart - p1.time) / (p2.time - p1.time);
                startX = this.margin.left;
                startY = y1 + (y2 - y1) * t;
            }

            // If end point is on the right of viewport
            if (p2.time > this.viewportStart + this.viewportDuration) {
                const t = (this.viewportStart + this.viewportDuration - p1.time) / (p2.time - p1.time);
                endX = this.margin.left + chartWidth;
                endY = y1 + (y2 - y1) * t;
            }

            if (isFirstVisiblePoint) {
                this.ctx.moveTo(startX, startY);
                isFirstVisiblePoint = false;
            }

            // If one of the points is bezier control point, draw curve
            if (p1.type === TimelineEditor.PointType.BEZIER || p2.type === TimelineEditor.PointType.BEZIER) {
                const cp1x = startX + (endX - startX) * 0.5;
                const cp1y = startY;
                const cp2x = startX + (endX - startX) * 0.5;
                const cp2y = endY;
                this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
            } else {
                this.ctx.lineTo(endX, endY);
            }
        }
        this.ctx.stroke();

        // Only draw visible control points
        this.points.forEach(point => {
            if (point.time >= this.viewportStart && point.time <= this.viewportStart + this.viewportDuration) {
                const x = this.margin.left + ((point.time - this.viewportStart) / this.viewportDuration) * chartWidth;
                const y = this.margin.top + (1 - point.value / 100) * chartHeight;

                this.ctx.beginPath();
                if (point.type === TimelineEditor.PointType.BEZIER) {
                    // Bezier control point drawing as square
                    this.ctx.fillStyle = point === this.selectedPoint ? '#FFF' : this.lineColor;
                    this.ctx.rect(x - this.pointRadius, y - this.pointRadius, 
                                this.pointRadius * 2, this.pointRadius * 2);
                } else {
                    // polyline control point drawing as circle
                    this.ctx.fillStyle = point === this.selectedPoint ? '#FFF' : this.lineColor;
                    this.ctx.arc(x, y, this.pointRadius, 0, Math.PI * 2);
                }
                this.ctx.fill();
                this.ctx.strokeStyle = '#FFF';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        });
    }

    drawGrid() {
        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
        const chartHeight = this.canvas.height - this.margin.top - this.margin.bottom;

        // Draw horizontal grid line (value scale)
        for (let i = 0; i <= 100; i += 10) {
            const y = this.margin.top + chartHeight - (i / 100) * chartHeight;
            
            // Configure the visual style of grid lines based on their scale importance
            // Major grid lines appear at 20% intervals (0%, 20%, 40%, 60%, 80%, 100%)
            if (i % 20 === 0) {
                this.ctx.strokeStyle = '#555';  // Brighter color for major grid lines
                this.ctx.lineWidth = 1;         // Thicker width for better visibility
            } else {
                this.ctx.strokeStyle = '#444';  // Darker color for minor grid lines (10%, 30%, etc.)
                this.ctx.lineWidth = 0.5;       // Thinner width to make them less prominent
            }
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.margin.left, y);
            this.ctx.lineTo(this.canvas.width - this.margin.right, y);
            this.ctx.stroke();
        }

        // Draw vertical grid line (time scale)
        const startSecond = Math.floor(this.viewportStart);
        const endSecond = Math.ceil(this.viewportStart + this.viewportDuration);

        for (let i = startSecond; i <= endSecond; i++) {
            const x = this.margin.left + ((i - this.viewportStart) / this.viewportDuration) * chartWidth;
            
            if (x >= this.margin.left && x <= this.canvas.width - this.margin.right) {
                if (i % 5 === 0) {
                    this.ctx.strokeStyle = '#555';
                    this.ctx.lineWidth = 1;
                } else {
                    this.ctx.strokeStyle = '#444';
                    this.ctx.lineWidth = 0.5;
                }
                this.ctx.beginPath();
                this.ctx.moveTo(x, this.margin.top);
                this.ctx.lineTo(x, this.canvas.height - this.margin.bottom);
                this.ctx.stroke();
            }
        }
    }

    drawTimeAxis() {
        this.ctx.fillStyle = '#999';  // Brighter text color
        this.ctx.font = '12px Arial';
        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;

        // Compute first and last major tick
        const firstMajorTick = Math.ceil(this.viewportStart / 5) * 5;
        const lastMajorTick = Math.floor((this.viewportStart + this.viewportDuration) / 5) * 5;

        // Only draw major ticks (5sec multiples)
        for (let i = firstMajorTick; i <= lastMajorTick; i += 5) {
            const x = this.margin.left + ((i - this.viewportStart) / this.viewportDuration) * chartWidth;
            
            // Only draw time labels within the current viewport
            if (x >= this.margin.left && x <= this.canvas.width - this.margin.right) {
                this.ctx.fillText(i + 's', x - 10, this.canvas.height - 10);
            }
        }
    }

    drawValueAxis() {
        this.ctx.fillStyle = '#999';  // Brighter text color
        this.ctx.font = '12px Arial';
        const chartHeight = this.canvas.height - this.margin.top - this.margin.bottom;
        
        // Only draw labels at 20% multiples
        for (let i = 0; i <= 100; i += 20) {
            const y = this.margin.top + chartHeight - (i / 100) * chartHeight;
            const text = i + '%';
            const textWidth = this.ctx.measureText(text).width;
            this.ctx.fillText(text, this.margin.left - textWidth - 10, y + 4);
        }
    }

    drawPlayhead() {
        // Only draw playhead if it is within the current viewport
        if (this.playhead.time >= this.viewportStart && 
            this.playhead.time <= this.viewportStart + this.viewportDuration) {
            
            const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
            const x = Math.round(this.margin.left + 
                ((this.playhead.time - this.viewportStart) / this.viewportDuration) * chartWidth);

            // Draw white vertical line
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.playhead.color;
            this.ctx.lineWidth = this.playhead.width;
            this.ctx.moveTo(x, this.margin.top);
            this.ctx.lineTo(x, this.canvas.height - this.margin.bottom);
            this.ctx.stroke();

            // Draw small triangle indicator on top
            this.ctx.beginPath();
            this.ctx.fillStyle = this.playhead.color;
            this.ctx.moveTo(x - 5, this.margin.top - 8);
            this.ctx.lineTo(x + 5, this.margin.top - 8);
            this.ctx.lineTo(x, this.margin.top);
            this.ctx.closePath();
            this.ctx.fill();
        }
    }

    drawMarkers() {
        const chartWidth = this.canvas.width - this.margin.left - this.margin.right;
        const chartHeight = this.canvas.height - this.margin.top - this.margin.bottom;

        this.ctx.strokeStyle = '#CC0000'; 
        this.ctx.lineWidth = 1;

        this.markers.forEach(time => {
            if (time >= this.viewportStart && time <= this.viewportStart + this.viewportDuration) {
                const x = Math.round(this.margin.left + 
                    ((time - this.viewportStart) / this.viewportDuration) * chartWidth);
                
                this.ctx.beginPath();
                this.ctx.moveTo(x, this.margin.top);
                this.ctx.lineTo(x, this.canvas.height - this.margin.bottom);
                this.ctx.stroke();
            }
        });
    }

    // Reset timeline to initial state
    reset() {
       this.points = [{ time: 0, value: 50 }, { time: 30, value: 50 }]; 
       this.markers = [];
       this.viewportStart = 0;
       this.viewportDuration = 30;
       this.selectedPoint = null;
       this.isDragging = false;
       this.draw();
    }

    // Export current curve data
    exportData() {
        const data = {
            points: this.points.map(p => ({
                time: p.time,
                value: p.value,
                type: p.type || TimelineEditor.PointType.LINEAR
            }))
        };
        return data;
    }

    // Import curve data
    importData(data) {
        if (data) {
            this.points = data.points.map(p => ({
                time: p.time,
                value: p.value,
                type: p.type || TimelineEditor.PointType.LINEAR
            }));
            
            //this.history = [];
            this.saveToHistory();
            this.draw();

            return true;
        }
        return false;
    }
    
    // Save history method for undo functionality
    saveToHistory() {
        // Deep copy current point data
        const snapshot = this.points.map(p => ({
            time: p.time,
            value: p.value,
            type: p.type
        }));

        this.history.push(snapshot);

        // If history records exceeded maximum length, remove earliest record
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }

    // Reset history
    resetHistory() {
        this.history = [];
        this.saveToHistory();
    }
    
    // Undo method - Reverts to the previous state in history
    undo() {
        if (this.history.length > 1) {
            this.history.pop();  // Remove current state
            // Deep copy last history record
            this.points = this.history[this.history.length - 1].map(p => ({
                time: p.time,
                value: p.value,
                type: p.type
            }));
            this.draw();
        }
    }

    // Get the value of the specified time point
    getValue(time) {
        // Ensure time is within valid range
        time = Math.max(0, Math.min(this.totalDuration, time));
        
        // Find the line segment the time point is located
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            
            if (time >= p1.time && time <= p2.time) {
                const t = (time - p1.time) / (p2.time - p1.time);
                
                if (p1.type === TimelineEditor.PointType.BEZIER || p2.type === TimelineEditor.PointType.BEZIER) {
                    // Bezier curve interpolation
                    const cp1y = p1.value;
                    const cp2y = p2.value;
                    return p1.value * Math.pow(1-t, 3) + 
                           cp1y * 3 * t * Math.pow(1-t, 2) + 
                           cp2y * 3 * Math.pow(t, 2) * (1-t) + 
                           p2.value * Math.pow(t, 3);
                } else {
                    // Linear interpolation
                    return p1.value + (p2.value - p1.value) * t;
                }
            }
        }
        
        // If time exceeds the last point, return the value of the last point
        return this.points[this.points.length - 1].value;
    }
    
    // Play control method
    play() {
        if (!this.playhead.isPlaying) {
            this.playhead.isPlaying = true;
            const frameInterval = 1000 / this.playhead.fps;
            
            this.playhead.timer = setInterval(() => {
                this.playhead.time += 1 / this.playhead.fps;
                
                // Stop when playhead reaches total duration or last control point
                const lastPoint = this.points[this.points.length - 1];
                if (this.playhead.time >= this.totalDuration || this.playhead.time >= lastPoint.time) {
                    this.pause();
                    return;
                }
                
                this.draw();
            }, frameInterval);
        }
    }

    // Pause control method
    pause() {
        if (this.playhead.isPlaying) {
            clearInterval(this.playhead.timer);
            this.playhead.isPlaying = false;
            this.playhead.timer = null;
        }
    }

    // Stop control method
    stop() {
        this.pause();
        this.seek(0);
    }

    // Seek control method
    seek(time) {
        this.playhead.time = Math.max(0, Math.min(this.totalDuration, time));
        this.draw();
    }

    // Add a mark at specified time
    addMarker(time) {
        time = Math.max(0, Math.min(this.totalDuration, time));
        this.markers.push(time);
        this.markers.sort((a, b) => a - b);
        this.draw();
        return this.markers.indexOf(time);
    }

    // Export markers data
    exportMarkers() {
        return {
            markers: [...this.markers]  // Create a copy of markers array
        };
    }

    // Import markers data
    importMarkers(data) {
        if (data && Array.isArray(data.markers)) {
            this.markers = [...data.markers];  // Create a copy of imported markers
            this.draw();
            return true;
        }
        return false;
    }

    // Remove all markers
    clearMarkers() {
        this.markers = [];
        this.draw();
    }
}


