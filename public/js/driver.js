const token = localStorage.getItem('driverToken');
if (!token) window.location.href = '/driver-login.html';

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusArea = document.getElementById('statusArea');
const sessionDisplay = document.getElementById('sessionDisplay');
const customerLink = document.getElementById('customerLink');

// Profile DOM Elements
const driverNameInput = document.getElementById('driverName');
const vehicleInfoInput = document.getElementById('vehicleInfo');
const updateProfileBtn = document.getElementById('updateProfileBtn');
const profileStatus = document.getElementById('profileStatus');
const logoutBtn = document.getElementById('logoutBtn');
const connBanner = document.getElementById('connBanner');
const connBannerText = document.getElementById('connBannerText');

let socket;
let currentSessionId = null;
let watchId = null;

// Fetch Profile on Load
async function loadDriverProfile() {
    try {
        const res = await fetch('/api/driver/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            driverNameInput.value = data.name;
            vehicleInfoInput.value = data.vehicleDetails || '';
        } else {
            handleAuthFailure();
        }
    } catch (err) {
        console.error('Failed to load profile.', err);
    }
}
loadDriverProfile();

// Update Profile Changes
updateProfileBtn.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/driver/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: driverNameInput.value,
                vehicleDetails: vehicleInfoInput.value
            })
        });
        
        if (res.ok) {
            profileStatus.textContent = '✅ Profile updated successfully.';
            profileStatus.className = 'status-msg success-text';
            profileStatus.classList.remove('hidden');
            setTimeout(() => profileStatus.classList.add('hidden'), 3000);
        } else {
            profileStatus.textContent = '❌ Failed to save profile.';
            profileStatus.className = 'status-msg error-text';
            profileStatus.classList.remove('hidden');
        }
    } catch (err) {
        alert('Server error.');
    }
});

// Logout Handler
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('driverToken');
    window.location.href = '/driver-login.html';
});

function handleAuthFailure() {
    localStorage.removeItem('driverToken');
    window.location.href = '/driver-login.html';
}

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
                handleAuthFailure();
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
        document.getElementById('statusBadge').className = 'status-badge delivered';
        stopBtn.classList.add('hidden');
        
    } catch (err) {
        alert('Error stopping tracking.');
    }
});

function setupSocketAndTracking() {
    // Configure socket connection with retry limits
    socket = io({
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });
    
    // Connection Monitoring UI feedback (Sprint 2 Auto-reconnect features)
    socket.on('connect', () => {
        connBanner.classList.add('hidden');
        console.log('Socket successfully connected');
        if (currentSessionId) {
            socket.emit('join_session', currentSessionId);
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason);
        connBannerText.textContent = '⚠️ Network signal dropped. Attempting to reconnect...';
        connBanner.classList.remove('hidden');
    });

    socket.on('reconnect_attempt', (attempt) => {
        console.log(`Reconnection attempt #${attempt}`);
        connBannerText.textContent = `⚠️ Reconnecting to tracking network (Attempt ${attempt}/10)...`;
    });

    socket.on('reconnect_failed', () => {
        console.error('Reconnection failed permanently.');
        connBannerText.textContent = '❌ Connection lost permanently. Please refresh dashboard.';
        connBanner.className = 'connection-banner error';
    });

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
