const token = localStorage.getItem('driverToken');
if (!token) window.location.href = '/driver-login.html';

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusArea = document.getElementById('statusArea');
const sessionDisplay = document.getElementById('sessionDisplay');
const customerLink = document.getElementById('customerLink');

let socket;
let currentSessionId = null;
let watchId = null;

startBtn.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/tracking/start', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (res.ok) {
            currentSessionId = data.sessionId;
            sessionDisplay.textContent = currentSessionId;
            
            const link = `${window.location.origin}/?session=${currentSessionId}`;
            customerLink.href = link;
            customerLink.textContent = link;

            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            statusArea.classList.remove('hidden');

            // Setup Socket & Geolocation
            setupSocketAndTracking();
        } else {
            alert('Error starting session: ' + data.error);
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('driverToken');
                window.location.href = '/driver-login.html';
            }
        }
    } catch (err) {
        alert('Server error.');
    }
});

stopBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/tracking/stop', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId: currentSessionId })
        });
        
        // Stop tracking
        if (watchId) navigator.geolocation.clearWatch(watchId);
        if (socket) socket.disconnect();
        
        document.getElementById('statusBadge').textContent = 'Delivered';
        document.getElementById('statusBadge').classList.add('delivered');
        stopBtn.classList.add('hidden');
        
    } catch (err) {
        alert('Error stopping tracking.');
    }
});

function setupSocketAndTracking() {
    socket = io();
    
    // Check Geolocation Support
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    watchId = navigator.geolocation.watchPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        console.log(`Sending coords: ${lat}, ${lng}`);
        
        if (socket.connected && currentSessionId) {
            socket.emit('driver_location_update', {
                sessionId: currentSessionId,
                lat,
                lng
            });
        }
    }, (error) => {
        console.error('GPS Error:', error);
    }, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000
    });
}
